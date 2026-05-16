import { Application } from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { logger } from './logger.js';
import { ERROR_CODE, ServiceConfig } from '#types/index.js';
import { env } from './env.js';
import { SERVICE_CONFIG } from './constants.js';
import { responseEnvelope } from '#utils/response-envelope.js';

class ServiceProxy {
    private static createProxyOptions(service: ServiceConfig): Options {
        return {
            target: service.url,
            changeOrigin: true,
            pathRewrite: service.pathRewrite,
            timeout: service.timeout || env.DEFAULT_TIMEOUT,
            logger: logger,
            on: {
                error: ServiceProxy.handleProxyError,
                proxyReq: ServiceProxy.handleProxyRequest,
                proxyRes: ServiceProxy.handleProxyResponse,
            },
        };
    }

    private static handleProxyError(err: Error, req: any, res: any): void {
        logger.error(`Proxy error for ${req.path}:`, err);

        res.status(ERROR_CODE.SERVER_UNAVAILABLE)
            .setHeader('Content-Type', 'application/json')
            .json(
                responseEnvelope({
                    state: 'error',
                    error: {
                        status: 'ServiceUnavailableError',
                        code: ERROR_CODE.SERVER_UNAVAILABLE,
                        detail: 'Service unavailable',
                    },
                }),
            );
    }

    private static handleProxyRequest(_proxyReq: any, req: any): void {
        logger.debug(`Proxying request to ${req.path}`);
    }

    private static handleProxyResponse(_proxyRes: any, req: any): void {
        logger.debug(`Received response for ${req.path}`);
    }

    public static setupProxy(app: Application): void {
        SERVICE_CONFIG.forEach((service) => {
            const proxyOptions = ServiceProxy.createProxyOptions(service);
            app.use(service.path, createProxyMiddleware(proxyOptions));
            logger.info(
                `Configured proxy for ${service.name} at ${service.path}`,
            );
        });
    }
}

export const proxyServices = (app: Application): void => {
    ServiceProxy.setupProxy(app);
};
