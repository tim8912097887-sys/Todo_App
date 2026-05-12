import { logger } from '#configs/logger.js';
import { comparePassword, hashPassword } from '#utils/password.js';
import { AuthRepository } from './repository.js';
import { LoginUserType } from './schemas/login.js';
import { CreateUserType } from './schemas/signup.js';
import { BadRequestError } from '#errors/bad-request.js';

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
                // TODO: Use rabbitmq to send email to user to verify account
                return;
            } else {
                this.logger.warn(
                    `User with email ${userInfo.email} already exists.`,
                );
                // TODO: Use rabbitmq to send email to user to reset password
                return;
            }
        }

        // Hash password
        const hashedPassword = await hashPassword(userInfo.password);
        userInfo.password = hashedPassword;
        const user = { ...userInfo };
        return this.authRepository.createUser(user);
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
}
