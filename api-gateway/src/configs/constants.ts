import { ServiceConfig } from '#types/index.js';
import { env } from './env.js';

export const SERVICE_CONFIG: ServiceConfig[] = [
    {
        path: '/api/v1/auth/',
        url: env.AUTH_SERVICE_URL,
        pathRewrite: {
            '^/': '/api/v1/auth/',
        },
        name: 'auth-service',
        timeout: 5000,
    },
    {
        path: '/api/todo/',
        url: env.TODO_SERVICE_URL,
        pathRewrite: {
            '^/': '/api/todo/',
        },
        name: 'todo-service',
    },
];
