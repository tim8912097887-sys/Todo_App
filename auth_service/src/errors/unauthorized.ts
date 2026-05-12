import { ERROR_CODE } from '#types/index.js';
import { ApiError } from './api.js';

export class UnauthorizedError extends ApiError {
    constructor(
        message: string,
        public metadata?: { email?: string; reason?: string },
    ) {
        const enrichedMessage = metadata?.email
            ? `User ${metadata.email} is not authorized`
            : message;
        super(ERROR_CODE.UNAUTHORIZED, enrichedMessage, true);
    }
}
