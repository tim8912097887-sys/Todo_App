import express from 'express';
import morgan from 'morgan';
import { errorHandler } from '#middlewares/error-handler.js';
import { notFoundHandler } from '#middlewares/not-found-handler.js';
import { rateLimitMiddleware } from '#middlewares/rate-limit.js';

export const initializeApp = () => {
    const app = express();
    // Body parser middleware
    app.use(express.json());

    // HTTP request logger middleware
    app.use(
        morgan(':method :url :status :res[content-length] - :response-time ms'),
    ); // Log to console

    // Rate Limiting Middleware
    app.use(rateLimitMiddleware);
    // Healthy check endpoint
    app.get('/health', (_req, res) => {
        res.status(200).json({
            status: 'OK',
            service: 'Api-Gateway_Service',
            timestamp: new Date().toISOString(),
        });
    });

    // Error Handler
    app.use(errorHandler);
    app.use(notFoundHandler);
    return app;
};
