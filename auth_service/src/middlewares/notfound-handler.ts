import { responseEnvelope } from '#utils/response-envelope.js';
import { ERROR_CODE } from '#types/index.js';
import { RequestHandler } from 'express';
import { logger } from '#configs/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
    logger.warn(
        `NotFoundHandler: Ip ${req.ip} enter not found route ${req.method} ${req.url}`,
    );

    res.status(ERROR_CODE.NOT_FOUND).json(
        responseEnvelope({
            state: 'error',
            error: {
                status: 'NotFoundError',
                code: ERROR_CODE.NOT_FOUND,
                detail: 'The requested resource was not found.',
            },
        }),
    );
};
