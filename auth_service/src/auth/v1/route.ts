import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '#configs/logger.js';
import { AuthController } from './controller.js';
import { bodySchemaValidator } from '#middlewares/schema/body.js';
import { CreateUserSchema } from './schemas/signup.js';
import { LoginUserSchema } from './schemas/login.js';
import { tokenMiddleware } from '#middlewares/token.js';
import { VerifyAccountSchema } from './schemas/verify.js';

export class AuthRoute {
    private readonly logger = logger;
    private router: Router;
    constructor(private readonly authController: AuthController) {
        this.router = Router();
        this.registerRoutes();
    }

    public getRouter(): Router {
        return this.router;
    }

    private registerRoutes() {
        this.logger.debug('AuthRoutes: Registering all routes');
        this.router.post(
            '/signup',
            bodySchemaValidator(CreateUserSchema),
            (req: Request, res: Response, next: NextFunction) =>
                this.authController.signup(req, res, next),
        );
        this.router.post(
            '/login',
            bodySchemaValidator(LoginUserSchema),
            (req: Request, res: Response, next: NextFunction) =>
                this.authController.login(req, res, next),
        );

        this.router.post(
            '/logout-all',
            tokenMiddleware,
            (req: Request, res: Response, next: NextFunction) =>
                this.authController.logoutAll(req, res, next),
        );

        this.router.post(
            '/logout',
            tokenMiddleware,
            (req: Request, res: Response, next: NextFunction) =>
                this.authController.logout(req, res, next),
        );

        this.router.post(
            '/verify-account',
            bodySchemaValidator(VerifyAccountSchema),
            (req: Request, res: Response, next: NextFunction) =>
                this.authController.verifyAccount(req, res, next),
        );
        this.logger.debug('AuthRoutes: All routes registered successfully');
    }
}
