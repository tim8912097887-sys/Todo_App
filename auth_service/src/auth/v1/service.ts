import { logger } from '#configs/logger.js';
import { comparePassword, hashPassword } from '#utils/password.js';
import { AuthRepository } from './repository.js';
import { LoginUserType } from './schemas/login.js';
import { CreateUserType } from './schemas/signup.js';
import { BadRequestError } from '#errors/bad-request.js';
import { sendToQueue } from '#configs/rabbitmq.js';
import { generateOTP } from '#utils/otp.js';
import { redisInstance } from '#configs/redis.js';

export class AuthService {
    private readonly logger = logger;
    constructor(private readonly authRepository: AuthRepository) {}

    async signup(userInfo: CreateUserType) {
        const [existingUser] = await this.authRepository.findUserByEmail(
            userInfo.email,
        );
        if (existingUser) {
            if (!existingUser.isVerified) {
                this.logger.warn(
                    `User with email ${userInfo.email} already exists but not verified.`,
                );
                const [otp] = await this.authRepository.createOtp(
                    existingUser.id,
                    generateOTP(6),
                );
                // TODO: Use rabbitmq to send email to user to verify account
                await sendToQueue('signup_email', {
                    username: existingUser.username,
                    email: existingUser.email,
                    code: otp.code,
                });
                return;
            } else {
                this.logger.warn(
                    `User with email ${userInfo.email} already exists.`,
                );
                await sendToQueue('signup_verified_email', {
                    username: existingUser.username,
                    email: existingUser.email,
                });
                return;
            }
        }

        // Hash password
        const hashedPassword = await hashPassword(userInfo.password);
        userInfo.password = hashedPassword;
        const user = { ...userInfo };
        const [createdUser] = await this.authRepository.createUser(user);
        const code = generateOTP(6);
        const [otp] = await this.authRepository.createOtp(createdUser.id, code);

        await sendToQueue('signup_email', {
            username: createdUser.username,
            email: createdUser.email,
            code: otp.code,
        });

        return createdUser;
    }

    async login(userInfo: LoginUserType) {
        const [exsistingUser] = await this.authRepository.findUserByEmail(
            userInfo.email,
        );
        if (!exsistingUser || !exsistingUser.isVerified) {
            if (!exsistingUser) {
                this.logger.warn(
                    `User with email ${userInfo.email} not found.`,
                );
            } else {
                this.logger.warn(
                    `User with email ${userInfo.email} is not verified.`,
                );
            }
            throw new BadRequestError('Email or Password is incorrect.');
        }
        // Check if account is locked due to too many failed login attempts
        if (exsistingUser.loginLock && exsistingUser.loginLock > new Date()) {
            this.logger.warn(
                `User with email ${userInfo.email} is locked until ${exsistingUser.loginLock.toISOString()}.`,
            );
            throw new BadRequestError(
                `Account is locked. Please try again after ${exsistingUser.loginLock.toISOString()}.`,
            );
        }
        const isMatch = await comparePassword(
            userInfo.password,
            exsistingUser.password,
        );
        if (!isMatch) {
            const loginAttempt = exsistingUser.loginAttempt + 1;
            if (loginAttempt >= 3) {
                // Reset login attempt and lock account for 15 minutes
                await this.authRepository.setLoginAttempt(
                    exsistingUser.email,
                    0,
                );
                await this.authRepository.setLoginLock(
                    exsistingUser.email,
                    new Date(Date.now() + 15 * 60 * 1000),
                );
            } else {
                await this.authRepository.setLoginAttempt(
                    exsistingUser.email,
                    loginAttempt,
                );
            }
            this.logger.warn(
                `User with email ${userInfo.email} not match password ${userInfo.password} attempt ${loginAttempt}.`,
            );
            throw new BadRequestError('Email or Password is incorrect.');
        }

        // Reset login attempt and lock
        await this.authRepository.resetLoginAttemptAndLock(userInfo.email);
        const { password: _password, ...user } = exsistingUser;
        return user;
    }

    async logoutAll(logoutAllInfo: { userId: string; tokenVersion: number }) {
        const { userId, tokenVersion } = logoutAllInfo;
        const [user] = await this.authRepository.findUserById(userId);
        if (!user) {
            this.logger.warn(`User with id ${userId} not found.`);
            throw new BadRequestError('User not found.');
        }

        if (user.tokenVersion !== tokenVersion) {
            this.logger.warn(
                `User with id ${userId} token version ${user.tokenVersion} not match token version ${tokenVersion}.`,
            );
            throw new BadRequestError('Token version is incorrect.');
        }

        await this.authRepository.incrementTokenVersion(userId);
    }

    async logout(logoutInfo: {
        sub: string;
        token_version: number;
        jti: string;
        exp: number;
    }) {
        const {
            sub: userId,
            token_version: tokenVersion,
            jti,
            exp,
        } = logoutInfo;
        const [user] = await this.authRepository.findUserById(userId);
        if (!user) {
            this.logger.warn(`User with id ${userId} not found.`);
            throw new BadRequestError('User not found.');
        }

        if (user.tokenVersion !== tokenVersion) {
            this.logger.warn(
                `User with id ${userId} token version ${user.tokenVersion} not match token version ${tokenVersion}.`,
            );
            throw new BadRequestError('Token version is incorrect.');
        }

        const leftTime = Math.ceil(exp - Date.now() / 1000);
        if (leftTime > 0) {
            await redisInstance.set(`jti_${jti}`, 'blacklisted', {
                expiration: {
                    type: 'EX',
                    value: leftTime,
                },
            });
        }
    }

    async verifyAccount(verifyInfo: { code: string; email: string }) {
        const { code, email } = verifyInfo;
        const [user] = await this.authRepository.findUserByEmail(email);
        if (!user) {
            this.logger.warn(`User with email ${email} not found.`);
            throw new BadRequestError('User not found.');
        }
        if (user.isVerified) {
            this.logger.warn(`User with email ${email} is already verified.`);
            throw new BadRequestError('User is already verified.');
        }
        const otp = await this.authRepository.verifyUser(user.id, code);
        if (!otp) {
            this.logger.warn(
                `User with email ${email} not found otp with code ${code}.`,
            );
            throw new BadRequestError('OTP is incorrect.');
        }
        await this.authRepository.deleteOtpByUserId(user.id, code);
        return;
    }
}
