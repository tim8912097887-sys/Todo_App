import { ValidationError } from '#types/index.js';
import { ZodError } from 'zod';

export const formatValidatedError = (error: ZodError) => {
    const errorMessage = error.issues.map((issue, index) => ({
        field: issue.path[index],
        value: issue.message,
    }));
    return errorMessage as ValidationError[];
};
