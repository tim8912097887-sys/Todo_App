import { describe, expect, it, beforeEach, afterEach, vitest } from 'vitest';
import { faker } from '@faker-js/faker';
import { Request, Response, NextFunction } from 'express';
import { AuthController } from '#auth/v1/controller.js';
import {
    getMockCreateUserData,
    getMockLoginData,
    createTestUser,
    cleanupUsers,
    createTestOtp,
    cleanupOtps,
} from '../utils/auth.js';
import { BadRequestError } from '#errors/bad-request.js';
import { authContainer } from '#auth/v1/container.js';
import * as rabbitmq from '#configs/rabbitmq.js';
import { db } from '#db/index.js';
import { users } from '#db/schema/user.js';
import { redisInstance } from '#configs/redis.js';
import { eq } from 'drizzle-orm';
import { AUTH_LIMITS } from '#auth/v1/constants.js';

describe('Auth Controller', () => {
    let authController: AuthController;
    let mockResponse: Response;
    let mockNext: NextFunction;
    const createdEmails: string[] = [];
    const createdUserIds: string[] = [];

    beforeEach(() => {
        authController = authContainer.getController();
        mockResponse = {
            status: vitest.fn().mockReturnThis(),
            json: vitest.fn().mockReturnThis(),
            cookie: vitest.fn().mockReturnThis(),
            clearCookie: vitest.fn().mockReturnThis(),
        } as unknown as Response;
        mockNext = vitest.fn();
        vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);
    });

    afterEach(async () => {
        await cleanupUsers(createdEmails);
        await cleanupOtps(createdUserIds);
        createdEmails.length = 0;
        createdUserIds.length = 0;
        vitest.clearAllMocks();
    });

    describe('signup', () => {
        it('should return 201 and success message when signup with new user', async () => {
            const signupData = getMockCreateUserData({
                email: faker.internet.email().toLowerCase(),
            });
            createdEmails.push(signupData.email);

            const mockRequest = {
                body: signupData,
            } as Request;

            await authController.signup(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(mockResponse.status).toHaveBeenCalledWith(201);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Signup successfully',
                    },
                }),
            );
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith(
                'signup_email',
                expect.any(Object),
            );
        });

        it('should return 201 when signup with existing verified email (sends warning email)', async () => {
            const signupData = getMockCreateUserData({
                email: faker.internet.email().toLowerCase(),
            });
            createdEmails.push(signupData.email);
            await createTestUser({
                email: signupData.email,
                password: signupData.password,
                emailVerifiedAt: new Date(),
            });

            const mockRequest = {
                body: signupData,
            } as Request;

            await authController.signup(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(mockResponse.status).toHaveBeenCalledWith(201);
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith(
                'signup_verified_email',
                expect.any(Object),
            );
        });

        it('should return 201 when signup with existing unverified email (re-sends OTP)', async () => {
            const signupData = getMockCreateUserData({
                email: faker.internet.email().toLowerCase(),
            });
            createdEmails.push(signupData.email);
            await createTestUser({
                email: signupData.email,
                password: signupData.password,
                emailVerifiedAt: null,
            });

            const mockRequest = {
                body: signupData,
            } as Request;

            await authController.signup(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(mockResponse.status).toHaveBeenCalledWith(201);
            expect(rabbitmq.sendToQueue).toHaveBeenCalledWith(
                'signup_email',
                expect.any(Object),
            );
        });
    });

    describe('login', () => {
        it('should set access token cookie and return user data on valid login', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });

            const mockRequest = {
                body: loginData,
            } as Request;

            await authController.login(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(mockResponse.cookie).toHaveBeenCalledWith(
                'access_token',
                expect.any(String),
                expect.objectContaining({ httpOnly: true }),
            );
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: expect.objectContaining({
                        message: 'Login successfully',
                        user: {
                            id: createdUser.id,
                            email: createdUser.email,
                            username: createdUser.username,
                        },
                    }),
                }),
            );
        });

        it('should throw on login with non-existent email', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
            });

            const mockRequest = {
                body: loginData,
            } as Request;

            await expect(
                authController.login(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('should throw on login with unverified account', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: null,
            });

            const mockRequest = {
                body: loginData,
            } as Request;

            await expect(
                authController.login(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
        });

        it('should throw on login with wrong password', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'CorrectPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });

            const mockRequest = {
                body: {
                    email: loginData.email,
                    password: 'WrongPassword123!',
                },
            } as Request;

            await expect(
                authController.login(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
        });

        it('should throw on login when account is currently locked', async () => {
            const lockTime = new Date(Date.now() + 10 * 60 * 1000);
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
                loginUntil: lockTime,
            });

            const mockRequest = {
                body: loginData,
            } as Request;

            await expect(
                authController.login(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );
        });

        it('should increment login attempts and lock at first threshold (5 attempts)', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
                failLoginAttempt: AUTH_LIMITS.LOGIN_LOCK_1_THRESHOLD - 1,
            });

            const wrongRequest = {
                body: {
                    email: loginData.email,
                    password: 'WrongPassword123!',
                },
            } as Request;

            await expect(
                authController.login(
                    wrongRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );

            const [updatedUser] = await db
                .select({
                    failLoginAttempt: users.failLoginAttempt,
                    loginUntil: users.loginUntil,
                })
                .from(users)
                .where(eq(users.email, loginData.email));

            expect(updatedUser?.failLoginAttempt).toBe(
                AUTH_LIMITS.LOGIN_LOCK_1_THRESHOLD,
            );
            expect(updatedUser?.loginUntil).not.toBeNull();
            expect((updatedUser?.loginUntil as Date).getTime()).toBeGreaterThan(
                Date.now(),
            );
        });

        it('should lock account with second threshold (10 attempts) when reaching 10 attempts', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
                failLoginAttempt: AUTH_LIMITS.LOGIN_LOCK_2_THRESHOLD - 1,
            });

            const wrongRequest = {
                body: {
                    email: loginData.email,
                    password: 'WrongPassword123!',
                },
            } as Request;

            await expect(
                authController.login(
                    wrongRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );

            const [updatedUser] = await db
                .select({
                    failLoginAttempt: users.failLoginAttempt,
                    loginUntil: users.loginUntil,
                })
                .from(users)
                .where(eq(users.email, loginData.email));

            expect(updatedUser?.failLoginAttempt).toBe(
                AUTH_LIMITS.LOGIN_LOCK_2_THRESHOLD,
            );
            expect(updatedUser?.loginUntil).not.toBeNull();
        });

        it('should lock account with third threshold (15 attempts) when reaching 15 attempts', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
                failLoginAttempt: AUTH_LIMITS.LOGIN_LOCK_3_THRESHOLD - 1,
            });

            const wrongRequest = {
                body: {
                    email: loginData.email,
                    password: 'WrongPassword123!',
                },
            } as Request;

            await expect(
                authController.login(
                    wrongRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(
                new BadRequestError('Email or Password is incorrect.'),
            );

            const [updatedUser] = await db
                .select({
                    failLoginAttempt: users.failLoginAttempt,
                    loginUntil: users.loginUntil,
                })
                .from(users)
                .where(eq(users.email, loginData.email));

            expect(updatedUser?.failLoginAttempt).toBe(
                AUTH_LIMITS.LOGIN_LOCK_3_THRESHOLD,
            );
            expect(updatedUser?.loginUntil).not.toBeNull();
        });

        it('should reset login attempts and lock on successful login', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
                failLoginAttempt: 3,
            });

            const mockRequest = {
                body: loginData,
            } as Request;

            await authController.login(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            const [updatedUser] = await db
                .select({
                    failLoginAttempt: users.failLoginAttempt,
                    loginUntil: users.loginUntil,
                })
                .from(users)
                .where(eq(users.email, loginData.email));

            expect(updatedUser?.failLoginAttempt).toBe(0);
            expect(updatedUser?.loginUntil).toBeNull();
        });
    });

    describe('logoutAll', () => {
        it('should clear cookie and increment token version on valid logoutAll', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });

            const mockRequest = {
                user: {
                    sub: createdUser.id,
                    token_version: 0,
                },
            } as Request;

            await authController.logoutAll(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(mockResponse.clearCookie).toHaveBeenCalledWith(
                'access_token',
                expect.any(Object),
            );
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Logout all accounts successfully',
                    },
                }),
            );

            const [updatedUser] = await db
                .select({ tokenVersion: users.tokenVersion })
                .from(users)
                .where(eq(users.id, createdUser.id));

            expect(updatedUser?.tokenVersion).toBe(1);
        });

        it('should throw when logoutAll with mismatched token version', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });

            const mockRequest = {
                user: {
                    sub: createdUser.id,
                    token_version: 1,
                },
            } as Request;

            await expect(
                authController.logoutAll(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
            expect(mockResponse.clearCookie).not.toHaveBeenCalled();
        });

        it('should throw when logoutAll with non-existent user', async () => {
            const mockRequest = {
                user: {
                    sub: faker.string.uuid(),
                    token_version: 0,
                },
            } as Request;

            await expect(
                authController.logoutAll(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
        });
    });

    describe('logout', () => {
        it('should blacklist token and clear cookie when logout with future expiry', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });
            const futureExp = Math.ceil((Date.now() + 10 * 60 * 1000) / 1000);
            const redisSpy = vitest.spyOn(redisInstance, 'set');
            const mockRequest = {
                user: {
                    sub: createdUser.id,
                    token_version: 0,
                    jti: 'test-jti-123',
                    exp: futureExp,
                },
            } as Request;

            await authController.logout(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(redisSpy).toHaveBeenCalledWith(
                'jti_test-jti-123',
                'blacklisted',
                expect.objectContaining({
                    expiration: {
                        type: 'EX',
                        value: expect.any(Number),
                    },
                }),
            );
            expect(mockResponse.clearCookie).toHaveBeenCalledWith(
                'access_token',
                expect.any(Object),
            );
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Logout successfully',
                    },
                }),
            );
        });

        it('should not blacklist token when logout with already expired token', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });
            const pastExp = Math.ceil((Date.now() - 10 * 60 * 1000) / 1000);
            const redisSpy = vitest.spyOn(redisInstance, 'set');

            const mockRequest = {
                user: {
                    sub: createdUser.id,
                    token_version: 0,
                    jti: 'expired-jti-123',
                    exp: pastExp,
                },
            } as Request;

            await authController.logout(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            expect(redisSpy).not.toHaveBeenCalled();
            expect(mockResponse.clearCookie).toHaveBeenCalledWith(
                'access_token',
                expect.any(Object),
            );
            expect(mockResponse.status).toHaveBeenCalledWith(200);
        });

        it('should throw when logout with mismatched token version', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                emailVerifiedAt: new Date(),
            });
            const futureExp = Math.ceil((Date.now() + 10 * 60 * 1000) / 1000);

            const mockRequest = {
                user: {
                    sub: createdUser.id,
                    token_version: 1,
                    jti: 'test-jti-123',
                    exp: futureExp,
                },
            } as Request;

            await expect(
                authController.logout(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
            expect(mockResponse.clearCookie).not.toHaveBeenCalled();
        });

        it('should throw when logout with non-existent user', async () => {
            const futureExp = Math.ceil((Date.now() + 10 * 60 * 1000) / 1000);
            const mockRequest = {
                user: {
                    sub: faker.string.uuid(),
                    token_version: 0,
                    jti: 'test-jti-123',
                    exp: futureExp,
                },
            } as Request;

            await expect(
                authController.logout(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('Invalid token.'));
        });
    });

    describe('verifyAccount', () => {
        it('should mark user as verified and return success on valid verification', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            const createdUser = await createTestUser({
                email,
                password: 'ValidPassword123!',
                emailVerifiedAt: null,
            });
            createdUserIds.push(createdUser.id);

            const code = await createTestOtp(createdUser.id);

            const mockRequest = {
                body: {
                    email,
                    code,
                },
            } as Request;

            await authController.verifyAccount(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            const [verifiedUser] = await db
                .select({ emailVerifiedAt: users.emailVerifiedAt })
                .from(users)
                .where(eq(users.id, createdUser.id));

            expect(verifiedUser?.emailVerifiedAt).not.toBeNull();
            expect(mockResponse.status).toHaveBeenCalledWith(200);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Account verified successfully',
                    },
                }),
            );
        });

        it('should throw when verifyAccount with incorrect OTP code', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            const createdUser = await createTestUser({
                email,
                password: 'ValidPassword123!',
                emailVerifiedAt: null,
            });
            createdUserIds.push(createdUser.id);

            await createTestOtp(createdUser.id);

            const mockRequest = {
                body: {
                    email,
                    code: '000000',
                },
            } as Request;

            await expect(
                authController.verifyAccount(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('OTP expired or invalid.'));
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('should throw when verifyAccount with non-existent user', async () => {
            const mockRequest = {
                body: {
                    email: faker.internet.email().toLowerCase(),
                    code: '123456',
                },
            } as Request;

            await expect(
                authController.verifyAccount(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('Verification failed.'));
        });

        it('should throw when verifyAccount with already verified user', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            await createTestUser({
                email,
                password: 'ValidPassword123!',
                emailVerifiedAt: new Date(),
            });

            const mockRequest = {
                body: {
                    email,
                    code: '123456',
                },
            } as Request;

            await expect(
                authController.verifyAccount(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('Verification failed.'));
        });

        it('should throw when verifyAccount with expired or missing OTP', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            await createTestUser({
                email,
                password: 'ValidPassword123!',
                emailVerifiedAt: null,
            });

            const mockRequest = {
                body: {
                    email,
                    code: '123456',
                },
            } as Request;

            await expect(
                authController.verifyAccount(
                    mockRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(new BadRequestError('OTP expired or invalid.'));
        });
    });
});
