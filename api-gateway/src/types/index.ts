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

export type ValidationError = {
    field: string;
    value: string;
};
