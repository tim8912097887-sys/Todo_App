import { AuthPayload } from './index.ts';

declare global {
    namespace Express {
        interface Request {
            user: AuthPayload;
        }
    }
}
