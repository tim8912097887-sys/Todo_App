import { NextFunction, Request, Response } from 'express';
import { AuthService } from './service.js';
import { clearCookie, createCookieOptions, sendCookie } from '#utils/cookie.js';
import { createToken } from '#utils/token.js';
import { env } from '#configs/env.js';
import { responseEnvelope } from '#utils/response-envelope.js';
import { sendSuccessResponse } from '#utils/send-response.js';
import { SuccessResponse } from '#types/index.js';
import { UserDto } from './dto.js';

export class AuthController {
    constructor(private readonly authService: AuthService) {}

    async signup(req: Request, res: Response, _next: NextFunction) {
        await this.authService.signup(req.body);
        const data = { message: 'Signup successfully' };
        const successResponse = { res, data, statusCode: 201 };
        this.ok(successResponse);
    }

    async login(req: Request, res: Response, _next: NextFunction) {
        const user = await this.authService.login(req.body);
        const payload = { sub: user.id, token_version: user.tokenVersion };
        const accessToken = await createToken(
            payload,
            env.TOKEN_SECRET,
            env.TOKEN_EXPIRES_IN,
        );
        const cookieOptions = createCookieOptions({
            maxAge: 24 * 60 * 60 * 1000 * 7,
        });

        sendCookie(res, 'access_token', accessToken, cookieOptions);
        const returnUser = UserDto.fromEntity(user);
        const data = { user: returnUser, message: 'Login successfully' };
        const successResponse = { res, data };
        this.ok(successResponse);
    }

    async logoutAll(req: Request, res: Response, _next: NextFunction) {
        const userId = req.user.sub;
        const tokenVersion = req.user.token_version;
        await this.authService.logoutAll({ userId, tokenVersion });
        clearCookie(res, 'access_token');
        const data = { message: 'Logout all accounts successfully' };
        const successResponse = { res, data };
        this.ok(successResponse);
    }

    async logout(req: Request, res: Response, _next: NextFunction) {
        const sub = req.user.sub;
        const token_version = req.user.token_version;
        const jti = req.user.jti;
        const exp = req.user.exp;
        await this.authService.logout({ sub, token_version, jti, exp });
        clearCookie(res, 'access_token');
        const data = { message: 'Logout successfully' };
        const successResponse = { res, data };
        this.ok(successResponse);
    }

    async verifyAccount(req: Request, res: Response, _next: NextFunction) {
        const { code, email } = req.body;
        await this.authService.verifyAccount({ code, email });
        const data = { message: 'Account verified successfully' };
        const successResponse = { res, data };
        this.ok(successResponse);
    }

    protected ok<T>({ res, data, statusCode }: SuccessResponse<T>) {
        return sendSuccessResponse(
            res,
            responseEnvelope({
                state: 'success',
                data,
            }),
            statusCode,
        );
    }
}
