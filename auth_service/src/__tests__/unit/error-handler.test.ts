import { errorHandler } from '#middlewares/error-handler.js';
import { NotFoundError } from '#errors/not-found.js';
import { responseEnvelope } from '#utils/response-envelope.js';
import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vitest } from 'vitest';
import { BadRequestError } from '#errors/bad-request.js';
import { ValidationError } from '#types/index.js';

describe('Error Handler', () => {
    const mockRequest = {
        method: 'GET',
        path: '/api/v1/auth/signin',
        ip: '127.0.0.1',
    } as unknown as Request;

    const mockNext = vitest.fn() as unknown as NextFunction;

    it('When provide non-api error, should call response with status 500', async () => {
        const mockError = new Error('Non-api error');
        const mockResponse = {
            status: vitest.fn().mockReturnThis(),
            json: vitest.fn(),
        } as unknown as Response;

        errorHandler(mockError, mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(500);
        expect(mockResponse.json).toHaveBeenCalledWith({
            ...responseEnvelope({
                state: 'error',
                error: {
                    status: 'ServerError',
                    code: 500,
                    detail: 'An unexpected error occurred. Please try again later.',
                },
            }),
            meta: {
                timestamp: expect.any(String),
            },
        });
    });

    it('When provide not found error, should call response with status 404', async () => {
        const mockError = new NotFoundError('User', '123');
        const mockResponse = {
            status: vitest.fn().mockReturnThis(),
            json: vitest.fn(),
        } as unknown as Response;

        errorHandler(mockError, mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(404);
        expect(mockResponse.json).toHaveBeenCalledWith({
            ...responseEnvelope({
                state: 'error',
                error: {
                    status: mockError.type,
                    code: mockError.statusCode,
                    detail: mockError.message,
                },
            }),
            meta: {
                timestamp: expect.any(String),
            },
        });
    });

    it('When provide bad request error, should call response with status 400 and metadata included', async () => {
        const mockError = new BadRequestError('User', [
            {
                field: 'name',
                value: 'John',
            },
        ]);
        const mockResponse = {
            status: vitest.fn().mockReturnThis(),
            json: vitest.fn(),
        } as unknown as Response;

        errorHandler(mockError, mockRequest, mockResponse, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
            ...responseEnvelope({
                state: 'error',
                error: {
                    status: mockError.type,
                    code: mockError.statusCode,
                    detail: mockError.message,
                    errors: mockError.metadata as ValidationError[],
                },
            }),
            meta: {
                timestamp: expect.any(String),
            },
        });
    });
});
