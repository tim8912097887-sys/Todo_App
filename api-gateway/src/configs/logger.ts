import winston, { format, transports } from 'winston';
import { env } from './env.js';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

const { combine, timestamp, errors, printf, json } = format;

const centralLog = new Logtail(env.CENTRAL_LOG_TOKEN);

const devFormat = printf(({ level, message, service, timestamp }: any) => {
    return `${timestamp} ${service} [${level}]: ${message}`;
});

const logFormat =
    env.NODE_ENV === 'development' ? combine(timestamp(), devFormat) : json();

export const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    defaultMeta: { service: 'Api-Gateway_Service' },
    format: combine(
        logFormat,
        errors({ stack: env.NODE_ENV !== 'production' }),
    ),
    transports: [new transports.Console(), new LogtailTransport(centralLog)],
    exceptionHandlers: [
        new transports.Console(),
        new LogtailTransport(centralLog),
    ],
    rejectionHandlers: [
        new transports.Console(),
        new LogtailTransport(centralLog),
    ],
});

// Handle logger error
logger.on('error', (err: any) => {
    console.error(`Logging Error: ${err}`);
});

logger.info('Logger initialized');
centralLog.flush();
