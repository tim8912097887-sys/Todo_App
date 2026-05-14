import express from 'express';

export const initializeApp = async () => {
    const app = express();

    // Healthy check endpoint
    app.get('/health', (_req, res) => {
        res.status(200).json({
            status: 'OK',
            service: 'Auth_Service',
            timestamp: new Date().toISOString(),
        });
    });

    return app;
};
