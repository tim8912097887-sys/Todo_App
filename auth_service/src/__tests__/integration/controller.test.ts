import { describe, expect, it, beforeEach, afterEach, vitest } from 'vitest';
import { faker } from '@faker-js/faker';
import { Request, Response, NextFunction } from 'express';
import { AuthController } from '#auth/v1/controller.js';
import {
    getMockCreateUserData,
    getMockLoginData,
    createTestUser,
    cleanupUsers,
} from '../utils/auth.js';
import { BadRequestError } from '#errors/bad-request.js';
import { authContainer } from '#auth/v1/container.js';
import * as rabbitmq from '#configs/rabbitmq.js';
import { db } from '#db/index.js';
import { otps } from '#db/schema/otp.js';
import { users } from '#db/schema/user.js';
import { redisInstance } from '#configs/redis.js';
import { eq } from 'drizzle-orm';

describe('Auth Controller', () => {
    let authController: AuthController;
    let mockResponse: Response;
    let mockNext: NextFunction;
    const createdEmails: string[] = [];

    beforeEach(() => {
        authController = authContainer.getController();
        mockResponse = {
            status: vitest.fn().mockReturnThis(),
            json: vitest.fn().mockReturnThis(),
            cookie: vitest.fn().mockReturnThis(),
            clearCookie: vitest.fn().mockReturnThis(),
        } as unknown as Response;
        mockNext = vitest.fn();
    });

    afterEach(async () => {
        await cleanupUsers(createdEmails);
        createdEmails.length = 0;
    });

    describe('signup', () => {
        // Mock sendToQueue to prevent actual RabbitMQ calls during tests
        beforeEach(() => {
            vitest.spyOn(rabbitmq, 'sendToQueue').mockResolvedValue(undefined);
        });

        it('When signup with valid new user, then return 201 success response', async () => {
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
        });

        it('When signup with existing email, then still return success response', async () => {
            const signupData = getMockCreateUserData({
                email: faker.internet.email().toLowerCase(),
            });
            createdEmails.push(signupData.email);
            await createTestUser({
                email: signupData.email,
                password: signupData.password,
                isVerified: true,
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
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Signup successfully',
                    },
                }),
            );
        });

        it('When signup with existing unverified email, then still return success response', async () => {
            const signupData = getMockCreateUserData({
                email: faker.internet.email().toLowerCase(),
            });
            createdEmails.push(signupData.email);
            await createTestUser({
                email: signupData.email,
                password: signupData.password,
                isVerified: false,
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
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Signup successfully',
                    },
                }),
            );
        });
    });

    describe('login', () => {
        it('When login with valid credentials, then set cookie and return user data', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
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

        it('When login with wrong password, then throw BadRequestError', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'CorrectPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
            });

            const mockRequest = {
                body: {
                    email: loginData.email,
                    password: 'IncorrectPassword123!',
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
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.cookie).not.toHaveBeenCalled();
        });

        it('When login with unverified account, then throw BadRequestError', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: false,
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
            expect(mockResponse.cookie).not.toHaveBeenCalled();
        });

        it('When login with locked account, then throw BadRequestError with lock time', async () => {
            const lockTime = new Date(Date.now() + 10 * 60 * 1000);
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'LockedPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
                loginLock: lockTime,
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
                `Account is locked. Please try again after ${lockTime.toISOString()}.`,
            );
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.cookie).not.toHaveBeenCalled();
        });

        it('When login fails three times then fourth attempt is locked, then throw BadRequestError on fourth try', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
                loginAttempt: 2,
            });

            const wrongRequest = {
                body: {
                    email: loginData.email,
                    password: 'IncorrectPassword123!',
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

            const mockLockedRequest = {
                body: loginData,
            } as Request;

            await expect(
                authController.login(
                    mockLockedRequest,
                    mockResponse as Response,
                    mockNext as NextFunction,
                ),
            ).rejects.toThrow(`Account is locked. Please try again after`);
            expect(mockResponse.status).not.toHaveBeenCalled();
            expect(mockResponse.cookie).not.toHaveBeenCalled();
        });

        it('When login with not existing email, then throw BadRequestError', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
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
            expect(mockResponse.cookie).not.toHaveBeenCalled();
        });
    });

    describe('logoutAll', () => {
        it('When logoutAll with valid user and matching tokenVersion, then clear cookie and return success', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
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
        });

        it('When logoutAll with incorrect tokenVersion, then throw BadRequestError', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
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
            ).rejects.toThrow(
                new BadRequestError('Token version is incorrect.'),
            );
            expect(mockResponse.clearCookie).not.toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('When logoutAll with missing user, then throw BadRequestError', async () => {
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
            ).rejects.toThrow(new BadRequestError('User not found.'));
            expect(mockResponse.clearCookie).not.toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });
    });

    describe('logout', () => {
        it('When logout with valid token info and future exp, then blacklist jti, clear cookie and return success', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
            });
            const futureExp = Math.ceil((Date.now() + 10 * 60 * 1000) / 1000);
            const redisSpy = vitest
                .spyOn(redisInstance, 'set')
                .mockResolvedValue('OK' as any);

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
                `jti_test-jti-123`,
                'blacklisted',
                {
                    expiration: {
                        type: 'EX',
                        value: expect.any(Number),
                    },
                },
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

        it('When logout with past exp, then do not blacklist jti but still clear cookie', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
            });
            const pastExp = Math.ceil((Date.now() - 10 * 60 * 1000) / 1000);
            const redisSpy = vitest
                .spyOn(redisInstance, 'set')
                .mockResolvedValue('OK' as any);

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
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    state: 'success',
                    data: {
                        message: 'Logout successfully',
                    },
                }),
            );
        });

        it('When logout with incorrect tokenVersion, then throw BadRequestError', async () => {
            const loginData = getMockLoginData({
                email: faker.internet.email().toLowerCase(),
                password: 'ValidPassword123!',
            });
            createdEmails.push(loginData.email);
            const createdUser = await createTestUser({
                email: loginData.email,
                password: loginData.password,
                isVerified: true,
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
            ).rejects.toThrow(
                new BadRequestError('Token version is incorrect.'),
            );
            expect(mockResponse.clearCookie).not.toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('When logout with missing user, then throw BadRequestError', async () => {
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
            ).rejects.toThrow(new BadRequestError('User not found.'));
            expect(mockResponse.clearCookie).not.toHaveBeenCalled();
            expect(mockResponse.status).not.toHaveBeenCalled();
        });
    });

    describe('verifyAccount', () => {
        it('When verifyAccount with valid code and unverified user, then mark verified and return success', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            const createdUser = await createTestUser({
                email,
                password: 'ValidPassword123!',
                isVerified: false,
            });
            const [createdOtp] = await db
                .insert(otps)
                .values({
                    userId: createdUser.id,
                    code: '123456',
                })
                .returning({ code: otps.code });

            const mockRequest = {
                body: {
                    email,
                    code: createdOtp.code,
                },
            } as Request;

            await authController.verifyAccount(
                mockRequest,
                mockResponse as Response,
                mockNext as NextFunction,
            );

            const [verifiedUser] = await db
                .select({ isVerified: users.isVerified })
                .from(users)
                .where(eq(users.id, createdUser.id));

            expect(verifiedUser?.isVerified).toBe(true);
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

        it('When verifyAccount with incorrect code, then throw BadRequestError', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            const createdUser = await createTestUser({
                email,
                password: 'ValidPassword123!',
                isVerified: false,
            });
            await db.insert(otps).values({
                userId: createdUser.id,
                code: '123456',
            });

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
            ).rejects.toThrow(new BadRequestError('OTP is incorrect.'));
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('When verifyAccount with already verified user, then throw BadRequestError', async () => {
            const email = faker.internet.email().toLowerCase();
            createdEmails.push(email);
            await createTestUser({
                email,
                password: 'ValidPassword123!',
                isVerified: true,
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
            ).rejects.toThrow(new BadRequestError('User is already verified.'));
            expect(mockResponse.status).not.toHaveBeenCalled();
        });

        it('When verifyAccount with missing user, then throw BadRequestError', async () => {
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
            ).rejects.toThrow(new BadRequestError('User not found.'));
            expect(mockResponse.status).not.toHaveBeenCalled();
        });
    });
});
