import { ResponseStructure } from '#types/index.js';
import { Response } from 'express';

export const sendSuccessResponse = (
    res: Response,
    response: ResponseStructure,
    statusCode = 200,
) => res.status(statusCode).json(response);
