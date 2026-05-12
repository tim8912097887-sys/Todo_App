import express from 'express';
import morgan from 'morgan';
import { errorHandler } from '#middlewares/error-handler.js';
import { notFoundHandler } from '#middlewares/notfound-handler.js';
import { authContainer } from './auth/v1/container.js';
import cookieParser from 'cookie-parser';

export const initializeApp = () => {
    const app = express();

    app.use(cookieParser());
    // Body parser middleware
    app.use(express.json());

    // HTTP request logger middleware
    app.use(
        morgan(':method :url :status :res[content-length] - :response-time ms'),
    ); // Log to console

    // Healthy check endpoint
    app.get('/health', (_req, res) => {
        res.status(200).json({
            status: 'OK',
            service: 'Auth_Service',
            timestamp: new Date().toISOString(),
        });
    });

    // Auth routes
    app.use('/api/v1/auth', authContainer.getRouter());
    // Error Handler
    app.use(errorHandler);
    app.use(notFoundHandler);
    return app;
};
