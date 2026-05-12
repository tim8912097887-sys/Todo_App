import { ERROR_CODE } from '#types/index.js';
import { ApiError } from './api.js';

export class NotFoundError extends ApiError {
    constructor(
        public resource: string,
        public identifier?: string,
    ) {
        const message = identifier
            ? `${resource} with id ${identifier} not found`
            : `${resource} not found`;
        super(ERROR_CODE.NOT_FOUND, message, true);
    }
}
