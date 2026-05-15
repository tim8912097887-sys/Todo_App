import { redisInstance } from '#configs/redis.js';
import { db } from '#db/index.js';
import { Router } from 'express';

import { AuthController } from './controller.js';
import { AuthRepository } from './repository/auth.js';
import { OtpRepository } from './repository/otp.js';
import { TokenRepository } from './repository/token.js';
import { AuthRoute } from './route.js';
import { AuthService } from './service.js';

class AuthContainer {
    private static instance: AuthContainer | null = null;

    private router: Router | null = null;

    private authController: AuthController | null = null;

    private authService: AuthService | null = null;

    private authRepository: AuthRepository | null = null;

    private otpRepository: OtpRepository | null = null;

    private tokenRepository: TokenRepository | null = null;

    private constructor() {}

    public static getInstance(): AuthContainer {
        if (!AuthContainer.instance) {
            AuthContainer.instance = new AuthContainer();
        }

        return AuthContainer.instance;
    }

    public getRouter(): Router {
        if (!this.router) {
            this.router = new AuthRoute(this.getController()).getRouter();
        }

        return this.router;
    }

    public getController() {
        if (!this.authController) {
            this.authController = new AuthController(this.getService());
        }

        return this.authController;
    }

    public getService() {
        if (!this.authService) {
            this.authService = new AuthService(
                this.getRepository(),
                this.getOtpRepository(),
                this.getTokenRepository(),
            );
        }

        return this.authService;
    }

    public getRepository() {
        if (!this.authRepository) {
            this.authRepository = new AuthRepository(db);
        }

        return this.authRepository;
    }

    public getOtpRepository() {
        if (!this.otpRepository) {
            this.otpRepository = new OtpRepository(redisInstance);
        }

        return this.otpRepository;
    }

    public getTokenRepository() {
        if (!this.tokenRepository) {
            this.tokenRepository = new TokenRepository(redisInstance);
        }

        return this.tokenRepository;
    }
}

export const authContainer = AuthContainer.getInstance();
