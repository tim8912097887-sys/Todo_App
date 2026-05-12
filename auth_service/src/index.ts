import { Server } from 'http';
import { initializeApp } from './server.js';
import { env } from '#configs/env.js';
import { logger } from '#configs/logger.js';
import { shutdown, subscribeShutdown } from '#utils/shutdown.js';
import { db as _db, dbServer } from './db/index.js';

class AppServer {
    private static instance: AppServer;
    private server?: Server;
    // Prevent multiple shutdown process
    private isShutdown = false;
    private timeout = 10000;
    // Private constructor prevents direct "new AppServer()" calls
    private constructor() {
        this.setupProcessHandlers();
    }

    public static getInstance(): AppServer {
        if (!AppServer.instance) {
            AppServer.instance = new AppServer();
        }
        return AppServer.instance;
    }

    public async start(): Promise<void> {
        try {
            await dbServer.testConnection();
            const app = initializeApp();
            this.server = app.listen(env.PORT, () => {
                logger.info(
                    `Server initialization: Server start on port ${env.PORT}`,
                );
            });
            subscribeShutdown(this.disConnectServer);
            logger.info(
                `Server initialization: Successfully register shutdown`,
            );
        } catch (error: any) {
            logger.error(
                `Server Initialization: Server fail to start,Error: ${error}`,
            );
            process.exit(1);
        }
    }

    private setupProcessHandlers(): void {
        const exitSignals = [
            'SIGINT',
            'SIGTERM',
            'uncaughtException',
            'unhandledRejection',
        ];
        exitSignals.forEach((signal: string) => {
            process.on(signal, (reason) =>
                this.gracefulShutdown(signal, reason),
            );
        });
    }

    private async gracefulShutdown(
        signal: string,
        reason?: any,
    ): Promise<void> {
        if (this.isShutdown) return;
        this.isShutdown = true;

        logger.info(`\n${signal} received. Starting graceful shutdown...`);

        if (
            reason &&
            (signal === 'uncaughtException' || signal === 'unhandledRejection')
        ) {
            logger.error(`Reason: ${reason}`);
        }
        // Force exit after a timeout to prevent hanging
        const forceExit = setTimeout(() => {
            logger.error('Shutdown timed out. Forcing exit.');
            process.exit(1);
        }, this.timeout);

        try {
            await shutdown();
            logger.info('Shutdown complete. Goodbye!');
            clearTimeout(forceExit);
            process.exit(0);
        } catch (err) {
            logger.error('Error during shutdown:', err);
            process.exit(1);
        }
    }
    private async disConnectServer() {
        const serverInstance = this.server;
        // Stop accepting new requests
        if (serverInstance) {
            logger.info('Closing HTTP server...');
            await new Promise((resolve, reject) => {
                serverInstance.close((err) =>
                    err ? reject(err) : resolve('Success'),
                );
            });
            logger.info('HTTP server closed.');
        }
    }
}

const server = AppServer.getInstance();
await server.start();
