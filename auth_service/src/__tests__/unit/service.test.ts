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

            // Act
            const result = await authService.signup(mockCreateData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(mockAuthRepository.createUser).toHaveBeenCalled();
            expect(result).toEqual([mockCreatedUser]);
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

            // Act
            const result = await authService.signup(mockCreateData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
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

            // Act
            const result = await authService.signup(mockCreateData);

            // Assert
            expect(mockAuthRepository.findUserByEmail).toHaveBeenCalledWith(
                mockCreateData.email,
            );
            expect(mockAuthRepository.createUser).not.toHaveBeenCalled();
            expect(result).toBeUndefined();
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
});
