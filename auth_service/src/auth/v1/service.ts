import { logger } from '#configs/logger.js';
import { sendToQueue } from '#configs/rabbitmq.js';
import { BadRequestError } from '#errors/bad-request.js';
import { AUTH_LIMITS } from '#auth/v1/constants.js';
import { compareOtp, generateOTP, hashOtp } from '#utils/otp.js';
import { comparePassword, hashPassword } from '#utils/password.js';
import { AuthRepository } from './repository/auth.js';
import { OtpRepository } from './repository/otp.js';
import { TokenRepository } from './repository/token.js';
import { LoginUserType } from './schemas/login.js';
import { CreateUserType } from './schemas/signup.js';

export class AuthService {
    private readonly logger = logger;

    constructor(
        private readonly authRepository: AuthRepository,
        private readonly otpRepository: OtpRepository,
        private readonly tokenRepository: TokenRepository,
    ) {}

    async signup(userInfo: CreateUserType) {
        const [existingUser] = await this.authRepository.findUserByEmail(
            userInfo.email,
        );

        if (existingUser) {
            if (!existingUser.emailVerifiedAt) {
                await this.sendVerificationOtp(existingUser);
                this.logger.info(
                    `Resent verification OTP to ${userInfo.email} during signup attempt.`,
                );
                return;
            }
            this.logger.warn(
                `Signup attempt with already registered email ${userInfo.email}`,
            );
            // Send warning email to user about existing account
            sendToQueue('signup_verified_email', {
                email: userInfo.email,
                username: userInfo.username,
            });
            return;
        }

        const hashedPassword = await hashPassword(userInfo.password);

        const [createdUser] = await this.authRepository.createUser({
            ...userInfo,
            password: hashedPassword,
        });

        await this.sendVerificationOtp(createdUser);

        return createdUser;
    }

    async login(userInfo: LoginUserType) {
        const [existingUser] = await this.authRepository.findUserByEmail(
            userInfo.email,
        );

        if (!existingUser || !existingUser.emailVerifiedAt) {
            this.logger.warn(
                `Failed login attempt for email ${userInfo.email}`,
            );

            throw new BadRequestError('Email or Password is incorrect.');
        }

        if (existingUser.loginUntil && existingUser.loginUntil > new Date()) {
            this.logger.warn(
                `Account locked until ${existingUser.loginUntil.toISOString()} for email ${userInfo.email}`,
            );
            throw new BadRequestError('Email or Password is incorrect.');
        }

        const isMatch = await comparePassword(
            userInfo.password,
            existingUser.password,
        );

        if (!isMatch) {
            const loginAttempt = existingUser.failLoginAttempt + 1;

            await this.loginAttemptHandle({
                email: userInfo.email,
                attempt: loginAttempt,
            });

            this.logger.warn(
                `Failed login attempt ${loginAttempt} for ${userInfo.email}`,
            );

            throw new BadRequestError('Email or Password is incorrect.');
        }

        await this.authRepository.resetLoginAttemptAndLock(userInfo.email);

        const { password: _password, ...user } = existingUser;

        return user;
    }

    async verifyAccount(verifyInfo: { code: string; email: string }) {
        const { code, email } = verifyInfo;

        const [user] = await this.authRepository.findUserByEmail(email);

        if (!user || user.emailVerifiedAt) {
            this.logger.warn(`Verification failed for ${email}`);
            throw new BadRequestError('Verification failed.');
        }

        const otp = await this.otpRepository.getOtp({
            otpType: 'email_verification',
            userId: user.id,
        });

        if (!otp) {
            this.logger.warn(`OTP expired for ${email}`);
            throw new BadRequestError('OTP expired or invalid.');
        }

        const isMatch = await compareOtp(code, otp.code);

        if (!isMatch) {
            const attempt = await this.otpRepository.incrementOtpAttempt({
                otpType: 'email_verification',
                userId: user.id,
            });

            this.logger.warn(`Invalid OTP attempt ${attempt} for ${email}`);

            throw new BadRequestError('OTP expired or invalid.');
        }

        await this.otpRepository.deleteOtp({
            otpType: 'email_verification',
            userId: user.id,
        });

        await this.authRepository.updateUserEmailVerifiedAt(user.id);
    }

    async logoutAll(logoutAllInfo: { userId: string; tokenVersion: number }) {
        const { userId, tokenVersion } = logoutAllInfo;

        const [user] = await this.authRepository.findUserById(userId);

        if (!user || user.tokenVersion !== tokenVersion) {
            if (!user) {
                this.logger.warn(
                    `Logout all attempt for non-existent user ID ${userId}`,
                );
            } else {
                this.logger.warn(
                    `Logout all attempt with invalid token version for user ID ${userId}`,
                );
            }
            throw new BadRequestError('Invalid token.');
        }

        await this.authRepository.incrementTokenVersion(userId);
    }

    async logout(logoutInfo: {
        sub: string;
        token_version: number;
        jti: string;
        exp: number;
    }) {
        const { sub, token_version, jti, exp } = logoutInfo;

        const [user] = await this.authRepository.findUserById(sub);

        if (!user || user.tokenVersion !== token_version) {
            if (!user) {
                this.logger.warn(
                    `Logout attempt for non-existent user ID ${sub}`,
                );
            } else {
                this.logger.warn(
                    `Logout attempt with invalid token version for user ID ${sub}`,
                );
            }
            throw new BadRequestError('Invalid token.');
        }

        const leftTime = Math.ceil(exp - Date.now() / 1000);

        if (leftTime > 0) {
            await this.tokenRepository.blacklistToken({
                jti,
                exp: leftTime,
            });
        }
    }

    private async sendVerificationOtp(user: {
        id: string;
        username: string;
        email: string;
    }) {
        const code = generateOTP(6);

        const hashedCode = await hashOtp(code);

        await this.otpRepository.createOtp({
            userId: user.id,
            code: hashedCode,
            otpType: 'email_verification',
        });

        await sendToQueue('signup_email', {
            username: user.username,
            email: user.email,
            code,
        });
    }

    private async loginAttemptHandle(loginAttemptInfo: {
        email: string;
        attempt: number;
    }) {
        const { email, attempt } = loginAttemptInfo;

        let lockUntil: Date | null = null;

        if (attempt >= AUTH_LIMITS.LOGIN_LOCK_3_THRESHOLD) {
            lockUntil = new Date(
                Date.now() + AUTH_LIMITS.LOGIN_LOCK_3_DURATION_MS,
            );
        } else if (attempt >= AUTH_LIMITS.LOGIN_LOCK_2_THRESHOLD) {
            lockUntil = new Date(
                Date.now() + AUTH_LIMITS.LOGIN_LOCK_2_DURATION_MS,
            );
        } else if (attempt >= AUTH_LIMITS.LOGIN_LOCK_1_THRESHOLD) {
            lockUntil = new Date(
                Date.now() + AUTH_LIMITS.LOGIN_LOCK_1_DURATION_MS,
            );
        }

        await this.authRepository.updateLoginSecurityState(email, {
            attempt,
            lockUntil,
        });
    }
}
