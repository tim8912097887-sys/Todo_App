import { describe, expect, it, beforeEach, vitest, type Mocked } from 'vitest';
import { AuthService } from '#auth/v1/service.js';
import { AuthRepository } from '#auth/v1/repository/auth.js';
import { OtpRepository } from '#auth/v1/repository/otp.js';
import { TokenRepository } from '#auth/v1/repository/token.js';
import { BadRequestError } from '#errors/bad-request.js';
import * as passwordUtil from '#utils/password.js';
import * as otpUtil from '#utils/otp.js';
import * as rabbitmq from '#configs/rabbitmq.js';
import { CreateUserType } from '#auth/v1/schemas/signup.js';
import { LoginUserType } from '#auth/v1/schemas/login.js';
import { AUTH_LIMITS } from '#auth/v1/constants.js';

const makeAuthUser = (overrides: Partial<Record<string, any>> = {}) => ({
    id: 'user-id',
    email: 'user@example.com',
    username: 'testuser',
    password: 'hashed-password',
    emailVerifiedAt: new Date(),
    failLoginAttempt: 0,
    loginUntil: null,
    tokenVersion: 0,
    ...overrides,
});

const makeCreateUserData = (
    overrides: Partial<CreateUserType> = {},
): CreateUserType => ({
    username: 'testuser',
    email: 'newuser@example.com',
    password: 'SecurePassword123!',
    ...overrides,
});

const makeLoginData = (
    overrides: Partial<LoginUserType> = {},
): LoginUserType => ({
    email: 'user@example.com',
    password: 'SecurePassword123!',
    ...overrides,
});

describe('Auth Service', () => {
    let mockAuthRepository: Mocked<AuthRepository>;
    let mockOtpRepository: Mocked<OtpRepository>;
    let mockTokenRepository: Mocked<TokenRepository>;
    let authService: AuthService;

    beforeEach(() => {
        vitest.restoreAllMocks();

        mockAuthRepository = {
            findUserByEmail: vitest.fn(),
            createUser: vitest.fn(),
            findUserById: vitest.fn(),
            updateLoginSecurityState: vitest.fn(),
            resetLoginAttemptAndLock: vitest.fn(),
            incrementTokenVersion: vitest.fn(),
            updateUserEmailVerifiedAt: vitest.fn(),
        } as unknown as Mocked<AuthRepository>;

        mockOtpRepository = {
            createOtp: vitest.fn(),
            getOtp: vitest.fn(),
            incrementOtpAttempt: vitest.fn(),
            deleteOtp: vitest.fn(),
        } as unknown as Mocked<OtpRepository>;

        mockTokenRepository = {
            blacklistToken: vitest.fn(),
        } as unknown as Mocked<TokenRepository>;

        authService = new AuthService(
            mockAuthRepository,
            mockOtpRepository,
            mockTokenRepository,
        );
    });

    describe('signup', () => {
        it('creates a new user, stores verification OTP, and sends signup email', async () => {
            const mockCreateData = makeCreateUserData();
            const createdUser = {
                id: 'created-user-id',
                email: mockCreateData.email,
                username: mockCreateData.username,
            };

            vitest
                .spyOn(passwordUtil, 'hashPassword')
                .mockResolvedValue('hashed-password');
            vitest.spyOn(otpUtil, 'generateOTP').mockReturnValue('123456');
            vitest.spyOn(otpUtil, 'hashOtp').mockResolvedValue('hashed-otp');
            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);

            mockAuthRepository.findUserByEmail.mockResolvedValue([]);
            mockAuthRepository.createUser.mockResolvedValue([createdUser]);
            mockOtpRepository.createOtp.mockResolvedValue('OK');

            const result = await authService.signup(mockCreateData);

            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(passwordUtil.hashPassword).toHaveBeenCalledWith(
                mockCreateData.password,
            );
            expect(mockAuthRepository.createUser).toHaveBeenCalledWith({
                ...mockCreateData,
                password: 'hashed-password',
            });
            expect(mockOtpRepository.createOtp).toHaveBeenCalledWith({
                userId: createdUser.id,
                code: 'hashed-otp',
                otpType: 'email_verification',
            });
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith('signup_email', {
                username: createdUser.username,
                email: createdUser.email,
                code: '123456',
            });
            expect(result).toEqual(createdUser);
        });

        it('re-sends verification OTP when user exists but is not verified', async () => {
            const mockCreateData = makeCreateUserData();
            const existingUser = makeAuthUser({
                email: mockCreateData.email,
                emailVerifiedAt: null,
            });

            vitest.spyOn(otpUtil, 'generateOTP').mockReturnValue('123456');
            vitest.spyOn(otpUtil, 'hashOtp').mockResolvedValue('hashed-otp');
            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);

            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);
            mockOtpRepository.createOtp.mockResolvedValue('OK');

            const result = await authService.signup(mockCreateData);

            expect(result).toBeUndefined();
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
            expect(mockOtpRepository.createOtp).toHaveBeenCalledWith({
                userId: existingUser.id,
                code: 'hashed-otp',
                otpType: 'email_verification',
            });
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith('signup_email', {
                username: existingUser.username,
                email: existingUser.email,
                code: '123456',
            });
        });

        it('does not create a user and sends signup_verified_email when existing user is already verified', async () => {
            const mockCreateData = makeCreateUserData();
            const existingUser = makeAuthUser({
                email: mockCreateData.email,
                emailVerifiedAt: new Date(),
            });

            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);

            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);

            const result = await authService.signup(mockCreateData);

            expect(result).toBeUndefined();
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
            expect(mockOtpRepository.createOtp).not.toHaveBeenCalled();
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith(
                'signup_verified_email',
                {
                    email: existingUser.email,
                    username: existingUser.username,
                },
            );
        });

        it('propagates repository errors during signup', async () => {
            const mockCreateData = makeCreateUserData();
            mockAuthRepository.findUserByEmail.mockRejectedValue(
                new Error('Database error'),
            );

            await expect(authService.signup(mockCreateData)).rejects.toThrow(
                'Database error',
            );
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
        });
    });

    describe('login', () => {
        it('returns user without password for valid verified credentials', async () => {
            const mockLoginData = makeLoginData({ email: 'valid@example.com' });
            const existingUser = makeAuthUser({
                email: mockLoginData.email,
                password: 'hashed-password',
                emailVerifiedAt: new Date(),
                failLoginAttempt: 0,
                loginUntil: null,
            });

            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);
            mockAuthRepository.resetLoginAttemptAndLock.mockResolvedValue(
                {} as any,
            );
            vitest
                .spyOn(passwordUtil, 'comparePassword')
                .mockResolvedValue(true);

            const result = await authService.login(mockLoginData);

            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockLoginData.email,
            );
            expect(passwordUtil.comparePassword).toHaveBeenCalledWith(
                mockLoginData.password,
                existingUser.password,
            );
            expect(
                mockAuthRepository.resetLoginAttemptAndLock,
            ).toHaveBeenCalledWith(mockLoginData.email);
            expect(result).toEqual(
                expect.objectContaining({
                    id: existingUser.id,
                    email: existingUser.email,
                    username: existingUser.username,
                    tokenVersion: existingUser.tokenVersion,
                }),
            );
            expect(
                (result as Record<string, unknown>).password,
            ).toBeUndefined();
        });

        it('throws when user does not exist', async () => {
            const mockLoginData = makeLoginData();
            mockAuthRepository.findUserByEmail.mockResolvedValue([]);

            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
        });

        it('throws when user exists but email is not verified', async () => {
            const mockLoginData = makeLoginData();
            const existingUser = makeAuthUser({
                email: mockLoginData.email,
                emailVerifiedAt: null,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);

            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
        });

        it('throws when user account is currently locked', async () => {
            const mockLoginData = makeLoginData();
            const existingUser = makeAuthUser({
                email: mockLoginData.email,
                loginUntil: new Date(Date.now() + 10 * 60 * 1000),
                emailVerifiedAt: new Date(),
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);

            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
            expect(
                mockAuthRepository.updateLoginSecurityState,
            ).not.toHaveBeenCalled();
        });

        it('increments login security state when password is wrong', async () => {
            const mockLoginData = makeLoginData();
            const existingUser = makeAuthUser({
                email: mockLoginData.email,
                password: 'hashed-password',
                emailVerifiedAt: new Date(),
                failLoginAttempt: 0,
                loginUntil: null,
            });

            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);
            vitest
                .spyOn(passwordUtil, 'comparePassword')
                .mockResolvedValue(false);
            mockAuthRepository.updateLoginSecurityState.mockResolvedValue(
                {} as any,
            );

            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
            expect(
                mockAuthRepository.updateLoginSecurityState,
            ).toHaveBeenCalledWith(mockLoginData.email, {
                attempt: 1,
                lockUntil: null,
            });
        });

        it('locks account after reaching the first login lock threshold', async () => {
            const mockLoginData = makeLoginData();
            const existingUser = makeAuthUser({
                email: mockLoginData.email,
                password: 'hashed-password',
                emailVerifiedAt: new Date(),
                failLoginAttempt: AUTH_LIMITS.LOGIN_LOCK_1_THRESHOLD - 1,
                loginUntil: null,
            });

            vitest
                .spyOn(passwordUtil, 'comparePassword')
                .mockResolvedValue(false);
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);
            mockAuthRepository.updateLoginSecurityState.mockResolvedValue(
                {} as any,
            );
            const now = Date.now();
            const dateSpy = vitest.spyOn(Date, 'now').mockReturnValue(now);

            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );

            expect(
                mockAuthRepository.updateLoginSecurityState,
            ).toHaveBeenCalledWith(
                mockLoginData.email,
                expect.objectContaining({
                    attempt: AUTH_LIMITS.LOGIN_LOCK_1_THRESHOLD,
                    lockUntil: expect.any(Date),
                }),
            );
            const lockUntil = (
                mockAuthRepository.updateLoginSecurityState as Mocked<any>
            ).mock.calls[0][1].lockUntil;
            expect(lockUntil.getTime()).toBe(
                now + AUTH_LIMITS.LOGIN_LOCK_1_DURATION_MS,
            );
            dateSpy.mockRestore();
        });

        it('propagates repository errors during login', async () => {
            const mockLoginData = makeLoginData();
            mockAuthRepository.findUserByEmail.mockRejectedValue(
                new Error('Database error'),
            );

            await expect(authService.login(mockLoginData)).rejects.toThrow(
                'Database error',
            );
        });
    });

    describe('verifyAccount', () => {
        it('verifies account when code is correct', async () => {
            const mockUser = makeAuthUser({
                email: 'verify@example.com',
                emailVerifiedAt: null,
            });
            const verifyInfo = {
                email: mockUser.email,
                code: '123456',
            };

            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockOtpRepository.getOtp.mockResolvedValue({
                code: 'hashed-otp',
                attempt: 0,
                createdAt: new Date().toISOString(),
            });
            vitest.spyOn(otpUtil, 'compareOtp').mockResolvedValue(true);
            mockOtpRepository.deleteOtp.mockResolvedValue(1);
            mockAuthRepository.updateUserEmailVerifiedAt.mockResolvedValue(
                {} as any,
            );

            await authService.verifyAccount(verifyInfo);

            expect(mockOtpRepository.getOtp).toHaveBeenCalledWith({
                otpType: 'email_verification',
                userId: mockUser.id,
            });
            expect(otpUtil.compareOtp).toHaveBeenCalledWith(
                '123456',
                'hashed-otp',
            );
            expect(mockOtpRepository.deleteOtp).toHaveBeenCalledWith({
                otpType: 'email_verification',
                userId: mockUser.id,
            });
            expect(
                mockAuthRepository.updateUserEmailVerifiedAt,
            ).toHaveBeenCalledWith(mockUser.id);
        });

        it('throws when user is missing or already verified', async () => {
            mockAuthRepository.findUserByEmail.mockResolvedValue([]);

            await expect(
                authService.verifyAccount({
                    email: 'missing@example.com',
                    code: '123456',
                }),
            ).rejects.toThrow(new BadRequestError('Verification failed.'));

            const verifiedUser = makeAuthUser({ emailVerifiedAt: new Date() });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                verifiedUser,
            ]);

            await expect(
                authService.verifyAccount({
                    email: verifiedUser.email,
                    code: '123456',
                }),
            ).rejects.toThrow(new BadRequestError('Verification failed.'));
        });

        it('throws when OTP is expired or missing', async () => {
            const mockUser = makeAuthUser({
                email: 'verify@example.com',
                emailVerifiedAt: null,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockOtpRepository.getOtp.mockResolvedValue(null);

            await expect(
                authService.verifyAccount({
                    email: mockUser.email,
                    code: '123456',
                }),
            ).rejects.toThrow(new BadRequestError('OTP expired or invalid.'));
        });

        it('increments OTP attempt when code is invalid', async () => {
            const mockUser = makeAuthUser({
                email: 'verify@example.com',
                emailVerifiedAt: null,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockOtpRepository.getOtp.mockResolvedValue({
                code: 'hashed-otp',
                attempt: 0,
                createdAt: new Date().toISOString(),
            });
            vitest.spyOn(otpUtil, 'compareOtp').mockResolvedValue(false);
            mockOtpRepository.incrementOtpAttempt.mockResolvedValue(2);

            await expect(
                authService.verifyAccount({
                    email: mockUser.email,
                    code: 'wrong-code',
                }),
            ).rejects.toThrow(new BadRequestError('OTP expired or invalid.'));

            expect(mockOtpRepository.incrementOtpAttempt).toHaveBeenCalledWith({
                otpType: 'email_verification',
                userId: mockUser.id,
            });
        });
    });

    describe('logoutAll', () => {
        it('increments token version when user token version matches', async () => {
            const mockUser = makeAuthUser({ tokenVersion: 2 });
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            mockAuthRepository.incrementTokenVersion.mockResolvedValue(
                {} as any,
            );

            await authService.logoutAll({
                userId: mockUser.id,
                tokenVersion: 2,
            });

            expect(
                mockAuthRepository.incrementTokenVersion,
            ).toHaveBeenCalledWith(mockUser.id);
        });

        it('throws when user does not exist', async () => {
            mockAuthRepository.findUserById.mockResolvedValue([]);

            await expect(
                authService.logoutAll({
                    userId: 'missing-id',
                    tokenVersion: 0,
                }),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
        });

        it('throws when token version does not match', async () => {
            const mockUser = makeAuthUser({ tokenVersion: 1 });
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);

            await expect(
                authService.logoutAll({ userId: mockUser.id, tokenVersion: 2 }),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
        });
    });

    describe('logout', () => {
        it('blacklists token when logout info is valid and token has remaining life', async () => {
            const now = Date.now();
            vitest.spyOn(Date, 'now').mockReturnValue(now);

            const mockUser = makeAuthUser({ tokenVersion: 1 });
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            mockTokenRepository.blacklistToken.mockResolvedValue(undefined);

            await authService.logout({
                sub: mockUser.id,
                token_version: 1,
                jti: 'token-jti',
                exp: Math.floor(now / 1000) + 120,
            });

            expect(mockTokenRepository.blacklistToken).toHaveBeenCalledWith({
                jti: 'token-jti',
                exp: 120,
            });
        });

        it('does not blacklist token when expiry is already passed', async () => {
            const now = Date.now();
            vitest.spyOn(Date, 'now').mockReturnValue(now);

            const mockUser = makeAuthUser({ tokenVersion: 1 });
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);

            await authService.logout({
                sub: mockUser.id,
                token_version: 1,
                jti: 'token-jti',
                exp: Math.floor(now / 1000) - 1,
            });

            expect(mockTokenRepository.blacklistToken).not.toHaveBeenCalled();
        });

        it('throws when logout user does not exist or token version is invalid', async () => {
            mockAuthRepository.findUserById.mockResolvedValue([]);
            await expect(
                authService.logout({
                    sub: 'missing-id',
                    token_version: 1,
                    jti: 'token-jti',
                    exp: Math.floor(Date.now() / 1000) + 60,
                }),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));

            const mockUser = makeAuthUser({ tokenVersion: 1 });
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);

            await expect(
                authService.logout({
                    sub: mockUser.id,
                    token_version: 2,
                    jti: 'token-jti',
                    exp: Math.floor(Date.now() / 1000) + 60,
                }),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
        });
    });
});
