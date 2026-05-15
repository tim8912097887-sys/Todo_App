import { Response } from 'express';

export enum ERROR_CODE {
    BAD_REQUEST = 400,
    NOT_FOUND = 404,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    SERVER_ERROR = 500,
    SERVER_CONFLICT = 409,
    TOO_MANY_REQUEST = 429,
    SERVER_UNAVAILABLE = 503,
}

export type State = 'success' | 'error' | 'redirect';

export type ErrorObject = {
    status: string;
    code: ERROR_CODE;
    detail: string;
    errors?: ValidationError[];
};

export type Data = null | any;

export type Params = {
    state: State;
    data?: Data;
    error?: ErrorObject;
};
export type ResponseStructure = {
    state: State;
    error: ErrorObject | null;
    data: Data | null;
    meta: {
        timestamp: string;
    };
};

export type SuccessResponse<T> = {
    res: Response;
    data: T;
    statusCode?: number;
};

export type ValidationError = {
    field: string;
    value: string;
};

export type Payload = {
    sub: string;
    token_version: number;
};

export type AuthPayload = {
    sub: string;
    token_version: number;
    jti: string;
    iat: number;
    exp: number;
};

export type IUser = {
    id: string;
    email: string;
    username: string;
    password: string;
    tokenVersion: number;
    createdAt: Date;
    updatedAt: Date;
    isVerified: boolean;
    loginAttempt: number;
    loginLock: Date | null;
    deletedAt: Date | null;
};
