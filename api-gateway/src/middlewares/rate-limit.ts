import { logger } from '#configs/logger.js';
import { TooManyRequestError } from '#errors/too-many-request.js';
import { slidingWindowCounter } from '#utils/rate-limit.js';
import { RequestHandler } from 'express';

export const rateLimitMiddleware: RequestHandler = async (req, res, next) => {
    const ip = req.ip;
    const key = `rate_limit:${ip}`;
    const result = await slidingWindowCounter(key, 60_000, 100);
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader(
        'X-RateLimit-Remaining',
        Math.max(result.limit - result.current, 0),
    );
    if (!result.allowed) {
        logger.warn(
            `Rate limit exceeded for IP ${ip}. Current: ${result.current}, Limit: ${result.limit}`,
        );
        throw new TooManyRequestError(
            `Rate limit exceeded. Try again in ${Math.ceil((result.current / result.limit) * 60)} seconds.`,
        );
    }
    next();
};
