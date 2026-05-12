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
        } as unknown as Response;
        mockNext = vitest.fn();
    });

    afterEach(async () => {
        await cleanupUsers(createdEmails);
        createdEmails.length = 0;
    });

    describe('signup', () => {
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
});
