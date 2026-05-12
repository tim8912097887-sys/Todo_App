import { ZodObject } from 'zod';
import { RequestHandler } from 'express';
import { BadRequestError } from '#errors/bad-request.js';
import { formatValidatedError } from '#utils/error-format.js';

export const bodySchemaValidator =
    (schema: ZodObject): RequestHandler =>
    (req, _res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            const errorDetail = formatValidatedError(result.error);
            throw new BadRequestError(
                result.error.issues[0].message,
                errorDetail,
            );
        }
        // Attach validated data
        req.body = result.data;
        return next();
    };
