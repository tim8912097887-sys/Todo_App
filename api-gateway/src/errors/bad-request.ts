import { ERROR_CODE, ValidationError } from '#types/index.js';
import { ApiError } from './api.js';

export class BadRequestError extends ApiError {
    constructor(
        message: string,
        public readonly metadata?: ValidationError[],
    ) {
        super(ERROR_CODE.BAD_REQUEST, message, true);
    }
}
