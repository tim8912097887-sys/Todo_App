import { CookieOptions, Response } from 'express';
import { env } from '#configs/env.js';

export const createCookieOptions = (
    override?: Partial<CookieOptions>,
): CookieOptions => {
    return {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        ...override,
    };
};

export const sendCookie = (
    res: Response,
    name: string,
    value: string,
    options: CookieOptions,
) => res.cookie(name, value, options);

export const clearCookie = (
    res: Response,
    name: string,
    options?: Partial<CookieOptions>,
) =>
    res.clearCookie(name, {
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        httpOnly: true,
        ...options,
    });
