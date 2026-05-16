import { ErrorRequestHandler } from 'express';
import { responseEnvelope } from '#utils/response-envelope.js';
import { logger } from '#configs/logger.js';
import { BadRequestError } from '#errors/bad-request.js';
import { ApiError } from '#errors/api.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    // Variables for data envelope
    let statusCode = 500;
    let statusType = 'ServerError';
    let detail = 'An unexpected error occurred. Please try again later.';
    let metadata: any = undefined;

    if (err instanceof ApiError) {
        statusCode = err.statusCode;
        statusType = err.type;
        detail = err.message;

        if (err instanceof BadRequestError) {
            metadata = err.metadata;
        }
    }
    // Log useful context
    const logContext = {
        method: req.method,
        path: req.path,
        type: statusType,
        ip: req.ip,
        ...(metadata && { validationErrors: metadata }),
        stack: statusCode === 500 ? err.stack : undefined, // Only log stacks for 500s
    };

    if (statusCode >= 500) {
        logger.error(`[CRITICAL] ${err.message}`, logContext);
    } else {
        logger.warn(`[CLIENT_ERROR] ${detail}`, logContext);
    }

    // Uniform Response Structure
    return res.status(statusCode).json(
        responseEnvelope({
            state: 'error',
            error: {
                status: statusType,
                code: statusCode,
                detail,
                ...(metadata && { errors: metadata }), // Include if exists
            },
        }),
    );
};
