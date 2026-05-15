import { env } from '#configs/env.js';
import { logger } from '#configs/logger.js';
import { UnauthorizedError } from '#errors/unauthorized.js';
import { redisInstance } from '#configs/redis.js';
import { verifyToken } from '#utils/token.js';
import { RequestHandler } from 'express';

export const tokenMiddleware: RequestHandler = async (req, _res, next) => {
    const token = req.cookies['access_token'];
    if (!token) {
        logger.warn('No access token provided in request cookies');
        throw new UnauthorizedError('Access token is missing');
    }

    const decryptedToken = await verifyToken(token, env.TOKEN_SECRET);
    const isBlacklisted = await redisInstance.get(`jti_${decryptedToken.jti}`);
    if (isBlacklisted) {
        logger.warn(
            `Token for user ${decryptedToken.sub} with token version ${decryptedToken.token_version} is blacklisted`,
        );
        throw new UnauthorizedError('Access token is invalid');
    }
    req.user = decryptedToken;
    next();
};
