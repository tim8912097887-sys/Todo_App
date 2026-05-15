import { AuthService } from '#auth/v1/service.js';
import { AuthRepository } from '#auth/v1/repository.js';
import { BadRequestError } from '#errors/bad-request.js';
import { describe, expect, it, type Mocked, vitest, beforeEach } from 'vitest';
import {
    getMockCreateUserData,
    getMockLoginData,
    getMockUser,
} from '../utils/auth.js';
import * as passwordUtil from '#utils/password.js';
import * as rabbitmq from '#configs/rabbitmq.js';
import * as redisConfig from '#configs/redis.js';

describe('Auth Service', () => {
    let mockAuthRepository: Mocked<AuthRepository>;
    let authService: AuthService;

    beforeEach(() => {
        mockAuthRepository = {
            findUserByEmail: vitest.fn(),
            createUser: vitest.fn(),
            findUserById: vitest.fn(),
            setLoginAttempt: vitest.fn(),
            setLoginLock: vitest.fn(),
            resetLoginAttemptAndLock: vitest.fn(),
            deleteUserById: vitest.fn(),
            createOtp: vitest.fn(),
            incrementTokenVersion: vitest.fn(),
            verifyUser: vitest.fn(),
            deleteOtpByUserId: vitest.fn(),
        } as unknown as Mocked<AuthRepository>;

        authService = new AuthService(mockAuthRepository);
    });

    describe('signup', () => {
        it('When signup with valid user info and email does not exist, then return created user', async () => {
            // Arrange
            const mockCreateData = getMockCreateUserData();
            const mockCreatedUser = {
                id: '123',
                email: mockCreateData.email,
                username: mockCreateData.username,
            };
            mockAuthRepository.findUserByEmail.mockResolvedValue([]);
            mockAuthRepository.createUser.mockResolvedValue([mockCreatedUser]);
            mockAuthRepository.createOtp.mockResolvedValue([
                { code: '123456' },
            ]);
            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);

            // Act
            const result = await authService.signup(mockCreateData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(mockAuthRepository.createUser).toHaveBeenCalled();
            expect(mockAuthRepository.createOtp).toHaveBeenCalled();
            expect(result).toEqual(mockCreatedUser);
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith('signup_email', {
                username: mockCreatedUser.username,
                email: mockCreatedUser.email,
                code: '123456',
            });
        });

        it('When signup with email that exists and user is verified, then return undefined', async () => {
            // Arrange
            const mockCreateData = getMockCreateUserData();
            const existingUser = getMockUser({
                email: mockCreateData.email,
                isVerified: true,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);
            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);

            // Act
            const result = await authService.signup(mockCreateData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith(
                'signup_verified_email',
                {
                    username: existingUser.username,
                    email: existingUser.email,
                },
            );
        });

        it('When signup with email that exists but user is not verified, then return undefined', async () => {
            // Arrange
            const mockCreateData = getMockCreateUserData();
            const existingUser = getMockUser({
                email: mockCreateData.email,
                isVerified: false,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                existingUser,
            ]);
            mockAuthRepository.createOtp.mockResolvedValue([
                { code: '123456' },
            ]);
            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);

            // Act
            const result = await authService.signup(mockCreateData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith('signup_email', {
                username: existingUser.username,
                email: existingUser.email,
                code: '123456',
            });
        });

        it('When signup and repository error occurs during findUserByEmail, then throw error', async () => {
            // Arrange
            const mockCreateData = getMockCreateUserData();
            mockAuthRepository.findUserByEmail.mockRejectedValue(
                new Error('Database connection error'),
            );

            // Act & Assert
            await expect(authService.signup(mockCreateData)).rejects.toThrow(
                'Database connection error',
            );
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
        });

        it('When signup and repository error occurs during createUser, then throw error', async () => {
            // Arrange
            const mockCreateData = getMockCreateUserData();
            mockAuthRepository.findUserByEmail.mockResolvedValue([]);
            mockAuthRepository.createUser.mockRejectedValue(
                new Error('Failed to create user'),
            );

            // Act & Assert
            await expect(authService.signup(mockCreateData)).rejects.toThrow(
                'Failed to create user',
            );
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
        });
    });

    describe('login', () => {
        it('When login with valid credentials for verified user, then return user without password', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            const hashedPassword = await passwordUtil.hashPassword(
                mockLoginData.password,
            );
            const mockUser = getMockUser({
                email: mockLoginData.email,
                isVerified: true,
                loginAttempt: 0,
                loginLock: null,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                { ...mockUser, password: hashedPassword },
            ]);
            mockAuthRepository.resetLoginAttemptAndLock.mockResolvedValue({
                rowCount: 1,
            } as any);
            const comparePasswordSpy = vitest
                .spyOn(passwordUtil, 'comparePassword')
                .mockResolvedValue(true);

            // Act
            const result = await authService.login(mockLoginData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockLoginData.email,
            );
            expect(comparePasswordSpy).toHaveBeenCalledWith(
                mockLoginData.password,
                hashedPassword,
            );
            expect(
                mockAuthRepository.resetLoginAttemptAndLock,
            ).toHaveBeenCalledWith(mockLoginData.email);
            expect(result).not.toHaveProperty('password');
            expect(result).toEqual(
                expect.objectContaining({
                    id: mockUser.id,
                    email: mockUser.email,
                    username: mockUser.username,
                }),
            );
        });

        it('When login with non-existing user email, then throw BadRequestError', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            mockAuthRepository.findUserByEmail.mockResolvedValue([]);

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockLoginData.email,
            );
        });

        it('When login with unverified user, then throw BadRequestError', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            const unverifiedUser = getMockUser({
                email: mockLoginData.email,
                isVerified: false,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                unverifiedUser,
            ]);

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
        });

        it('When login with account locked, then throw BadRequestError with lock time', async () => {
            // Arrange
            const lockTime = new Date(Date.now() + 10 * 60 * 1000);
            const mockLoginData = getMockLoginData();
            const lockedUser = getMockUser({
                email: mockLoginData.email,
                isVerified: true,
                loginLock: lockTime,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([lockedUser]);

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                BadRequestError,
            );
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                `Account is locked. Please try again after ${lockTime.toISOString()}.`,
            );
        });

        it('When login with wrong password on first attempt, then increment login attempt', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            const hashedPassword = await passwordUtil.hashPassword(
                'CorrectPassword123!',
            );
            const mockUser = getMockUser({
                email: mockLoginData.email,
                isVerified: true,
                loginAttempt: 0,
                loginLock: null,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                { ...mockUser, password: hashedPassword },
            ]);
            mockAuthRepository.setLoginAttempt.mockResolvedValue({} as any);

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
            expect(mockAuthRepository.setLoginAttempt).toHaveBeenCalledWith(
                mockLoginData.email,
                1,
            );
        });

        it('When login with wrong password on third attempt, then lock account for 15 minutes', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            const mockUser = getMockUser({
                email: mockLoginData.email,
                isVerified: true,
                loginAttempt: 2,
                loginLock: null,
            });
            const hashedPassword = await passwordUtil.hashPassword(
                'CorrectPassword123!',
            );
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                { ...mockUser, password: hashedPassword },
            ]);
            mockAuthRepository.setLoginAttempt.mockResolvedValue({} as any);
            mockAuthRepository.setLoginLock.mockResolvedValue({} as any);

            vitest.mock('#utils/password.js', () => ({
                comparePassword: vitest.fn().mockResolvedValue(false),
                hashPassword: vitest.fn(),
            }));

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
            expect(mockAuthRepository.setLoginAttempt).toHaveBeenCalledWith(
                mockLoginData.email,
                0,
            );
            expect(mockAuthRepository.setLoginLock).toHaveBeenCalled();
        });

        it('When login and repository error occurs during findUserByEmail, then throw error', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            mockAuthRepository.findUserByEmail.mockRejectedValue(
                new Error('Database connection error'),
            );

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                'Database connection error',
            );
        });

        it('When login and repository error occurs during resetLoginAttemptAndLock, then throw error', async () => {
            // Arrange
            const mockLoginData = getMockLoginData();
            const hashedPassword = await passwordUtil.hashPassword(
                mockLoginData.password,
            );
            const mockUser = getMockUser({
                email: mockLoginData.email,
                isVerified: true,
                loginAttempt: 0,
                loginLock: null,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([
                { ...mockUser, password: hashedPassword },
            ]);
            mockAuthRepository.resetLoginAttemptAndLock.mockRejectedValue(
                new Error('Failed to reset login'),
            );
            vitest
                .spyOn(passwordUtil, 'comparePassword')
                .mockResolvedValue(true);

            // Act & Assert
            await expect(authService.login(mockLoginData)).rejects.toThrow(
                'Failed to reset login',
            );
        });
    });

    describe('logoutAll', () => {
        it('When logoutAll with valid userId and matching tokenVersion, then successfully increment token version', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const logoutAllInfo = {
                userId: mockUser.id,
                tokenVersion: mockUser.tokenVersion,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            mockAuthRepository.incrementTokenVersion.mockResolvedValue(
                {} as any,
            );

            // Act
            await authService.logoutAll(logoutAllInfo);

            // Assert
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
            expect(
                mockAuthRepository.incrementTokenVersion,
            ).toHaveBeenCalledWith(mockUser.id);
        });

        it('When logoutAll with non-existing userId, then throw BadRequestError', async () => {
            // Arrange
            const logoutAllInfo = {
                userId: 'non-existing-user-id',
                tokenVersion: 1,
            };
            mockAuthRepository.findUserById.mockResolvedValue([]);

            // Act & Assert
            await expect(authService.logoutAll(logoutAllInfo)).rejects.toThrow(
                new BadRequestError('User not found.'),
            );
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                logoutAllInfo.userId,
            );
            expect(
                mockAuthRepository.incrementTokenVersion,
            ).not.toHaveBeenCalled();
        });

        it('When logoutAll with incorrect tokenVersion, then throw BadRequestError', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const logoutAllInfo = {
                userId: mockUser.id,
                tokenVersion: 2,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);

            // Act & Assert
            await expect(authService.logoutAll(logoutAllInfo)).rejects.toThrow(
                new BadRequestError('Token version is incorrect.'),
            );
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
            expect(
                mockAuthRepository.incrementTokenVersion,
            ).not.toHaveBeenCalled();
        });

        it('When logoutAll and repository error occurs during findUserById, then throw error', async () => {
            // Arrange
            const logoutAllInfo = {
                userId: 'user-id',
                tokenVersion: 1,
            };
            mockAuthRepository.findUserById.mockRejectedValue(
                new Error('Database connection error'),
            );

            // Act & Assert
            await expect(authService.logoutAll(logoutAllInfo)).rejects.toThrow(
                'Database connection error',
            );
            expect(
                mockAuthRepository.incrementTokenVersion,
            ).not.toHaveBeenCalled();
        });

        it('When logoutAll and repository error occurs during incrementTokenVersion, then throw error', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const logoutAllInfo = {
                userId: mockUser.id,
                tokenVersion: mockUser.tokenVersion,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            mockAuthRepository.incrementTokenVersion.mockRejectedValue(
                new Error('Failed to increment token version'),
            );

            // Act & Assert
            await expect(authService.logoutAll(logoutAllInfo)).rejects.toThrow(
                'Failed to increment token version',
            );
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
        });
    });

    describe('verifyAccount', () => {
        it('When verifyAccount with valid code and unverified user, then delete otp and return', async () => {
            // Arrange
            const mockEmail = 'user@example.com';
            const mockUser = getMockUser({
                email: mockEmail,
                isVerified: false,
            });
            const verifyInfo = {
                email: mockEmail,
                code: '123456',
            };

            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockAuthRepository.verifyUser.mockResolvedValue({
                id: 'otp-id',
            } as any);
            mockAuthRepository.deleteOtpByUserId.mockResolvedValue({} as any);

            // Act
            await authService.verifyAccount(verifyInfo);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockEmail,
            );
            expect(mockAuthRepository.verifyUser).toHaveBeenCalledWith(
                mockUser.id,
                verifyInfo.code,
            );
            expect(mockAuthRepository.deleteOtpByUserId).toHaveBeenCalledWith(
                mockUser.id,
                verifyInfo.code,
            );
        });

        it('When verifyAccount with non-existing user email, then throw BadRequestError', async () => {
            // Arrange
            const verifyInfo = {
                email: 'missing@example.com',
                code: '123456',
            };
            mockAuthRepository.findUserByEmail.mockResolvedValue([]);

            // Act & Assert
            await expect(authService.verifyAccount(verifyInfo)).rejects.toThrow(
                new BadRequestError('User not found.'),
            );
            expect(mockAuthRepository.verifyUser).not.toHaveBeenCalled();
            expect(mockAuthRepository.deleteOtpByUserId).not.toHaveBeenCalled();
        });

        it('When verifyAccount with already verified user, then throw BadRequestError', async () => {
            // Arrange
            const mockEmail = 'verified@example.com';
            const verifyInfo = {
                email: mockEmail,
                code: '123456',
            };
            const mockUser = getMockUser({
                email: mockEmail,
                isVerified: true,
            });
            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);

            // Act & Assert
            await expect(authService.verifyAccount(verifyInfo)).rejects.toThrow(
                new BadRequestError('User is already verified.'),
            );
            expect(mockAuthRepository.verifyUser).not.toHaveBeenCalled();
            expect(mockAuthRepository.deleteOtpByUserId).not.toHaveBeenCalled();
        });

        it('When verifyAccount with incorrect otp code, then throw BadRequestError', async () => {
            // Arrange
            const mockEmail = 'user@example.com';
            const mockUser = getMockUser({
                email: mockEmail,
                isVerified: false,
            });
            const verifyInfo = {
                email: mockEmail,
                code: '000000',
            };
            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockAuthRepository.verifyUser.mockResolvedValue(null);

            // Act & Assert
            await expect(authService.verifyAccount(verifyInfo)).rejects.toThrow(
                new BadRequestError('OTP is incorrect.'),
            );
            expect(mockAuthRepository.deleteOtpByUserId).not.toHaveBeenCalled();
        });

        it('When verifyAccount and repository error occurs during findUserByEmail, then throw error', async () => {
            // Arrange
            const verifyInfo = {
                email: 'error@example.com',
                code: '123456',
            };
            mockAuthRepository.findUserByEmail.mockRejectedValue(
                new Error('Database connection error'),
            );

            // Act & Assert
            await expect(authService.verifyAccount(verifyInfo)).rejects.toThrow(
                'Database connection error',
            );
            expect(mockAuthRepository.verifyUser).not.toHaveBeenCalled();
        });

        it('When verifyAccount and repository error occurs during verifyUser, then throw error', async () => {
            // Arrange
            const mockEmail = 'user@example.com';
            const mockUser = getMockUser({
                email: mockEmail,
                isVerified: false,
            });
            const verifyInfo = {
                email: mockEmail,
                code: '123456',
            };
            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockAuthRepository.verifyUser.mockRejectedValue(
                new Error('Failed to verify OTP'),
            );

            // Act & Assert
            await expect(authService.verifyAccount(verifyInfo)).rejects.toThrow(
                'Failed to verify OTP',
            );
            expect(mockAuthRepository.deleteOtpByUserId).not.toHaveBeenCalled();
        });

        it('When verifyAccount and repository error occurs during deleteOtpByUserId, then throw error', async () => {
            // Arrange
            const mockEmail = 'user@example.com';
            const mockUser = getMockUser({
                email: mockEmail,
                isVerified: false,
            });
            const verifyInfo = {
                email: mockEmail,
                code: '123456',
            };
            mockAuthRepository.findUserByEmail.mockResolvedValue([mockUser]);
            mockAuthRepository.verifyUser.mockResolvedValue({
                id: 'otp-id',
            } as any);
            mockAuthRepository.deleteOtpByUserId.mockRejectedValue(
                new Error('Failed to delete OTP'),
            );

            // Act & Assert
            await expect(authService.verifyAccount(verifyInfo)).rejects.toThrow(
                'Failed to delete OTP',
            );
        });
    });

    describe('logout', () => {
        it('When logout with valid token info and leftTime > 0, then store jti in Redis', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const futureTimestamp = Math.ceil(
                (Date.now() + 10 * 60 * 1000) / 1000,
            );
            const logoutInfo = {
                sub: mockUser.id,
                token_version: mockUser.tokenVersion,
                jti: 'test-jti-123',
                exp: futureTimestamp,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            const redisSpy = vitest
                .spyOn(redisConfig.redisInstance, 'set')
                .mockResolvedValue('OK' as any);

            // Act
            await authService.logout(logoutInfo);

            // Assert
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
            expect(redisSpy).toHaveBeenCalledWith(
                `jti_${logoutInfo.jti}`,
                'blacklisted',
                {
                    expiration: {
                        type: 'EX',
                        value: expect.any(Number),
                    },
                },
            );
        });

        it('When logout with valid token info and leftTime <= 0, then not store jti in Redis', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const pastTimestamp = Math.ceil(
                (Date.now() - 10 * 60 * 1000) / 1000,
            );
            const logoutInfo = {
                sub: mockUser.id,
                token_version: mockUser.tokenVersion,
                jti: 'test-jti-123',
                exp: pastTimestamp,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            const redisSpy = vitest
                .spyOn(redisConfig.redisInstance, 'set')
                .mockResolvedValue('OK' as any);

            // Act
            await authService.logout(logoutInfo);

            // Assert
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
            expect(redisSpy).not.toHaveBeenCalled();
        });

        it('When logout with non-existing userId, then throw BadRequestError', async () => {
            // Arrange
            const futureTimestamp = Math.ceil(
                (Date.now() + 10 * 60 * 1000) / 1000,
            );
            const logoutInfo = {
                sub: 'non-existing-user-id',
                token_version: 1,
                jti: 'test-jti-123',
                exp: futureTimestamp,
            };
            mockAuthRepository.findUserById.mockResolvedValue([]);

            // Act & Assert
            await expect(authService.logout(logoutInfo)).rejects.toThrow(
                new BadRequestError('User not found.'),
            );
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                logoutInfo.sub,
            );
        });

        it('When logout with incorrect tokenVersion, then throw BadRequestError', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const futureTimestamp = Math.ceil(
                (Date.now() + 10 * 60 * 1000) / 1000,
            );
            const logoutInfo = {
                sub: mockUser.id,
                token_version: 2,
                jti: 'test-jti-123',
                exp: futureTimestamp,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);

            // Act & Assert
            await expect(authService.logout(logoutInfo)).rejects.toThrow(
                new BadRequestError('Token version is incorrect.'),
            );
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
        });

        it('When logout and repository error occurs during findUserById, then throw error', async () => {
            // Arrange
            const futureTimestamp = Math.ceil(
                (Date.now() + 10 * 60 * 1000) / 1000,
            );
            const logoutInfo = {
                sub: 'user-id',
                token_version: 1,
                jti: 'test-jti-123',
                exp: futureTimestamp,
            };
            mockAuthRepository.findUserById.mockRejectedValue(
                new Error('Database connection error'),
            );

            // Act & Assert
            await expect(authService.logout(logoutInfo)).rejects.toThrow(
                'Database connection error',
            );
        });

        it('When logout and Redis error occurs during set, then throw error', async () => {
            // Arrange
            const mockUser = getMockUser({
                tokenVersion: 1,
            });
            const futureTimestamp = Math.ceil(
                (Date.now() + 10 * 60 * 1000) / 1000,
            );
            const logoutInfo = {
                sub: mockUser.id,
                token_version: mockUser.tokenVersion,
                jti: 'test-jti-123',
                exp: futureTimestamp,
            };
            mockAuthRepository.findUserById.mockResolvedValue([mockUser]);
            vitest
                .spyOn(redisConfig.redisInstance, 'set')
                .mockRejectedValue(new Error('Redis connection error'));

            // Act & Assert
            await expect(authService.logout(logoutInfo)).rejects.toThrow(
                'Redis connection error',
            );
            expect(mockAuthRepository.findUserById).toHaveBeenCalledWith(
                mockUser.id,
            );
        });
    });
});
