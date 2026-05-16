import { ERROR_CODE } from '#types/index.js';
import { ApiError } from './api.js';

export class ServiceUnavailableError extends ApiError {
    constructor(message: string) {
        super(ERROR_CODE.SERVER_UNAVAILABLE, message, true);
    }
}
