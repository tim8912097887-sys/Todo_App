import nodemailer, { Transporter } from 'nodemailer';
import { logger } from './logger.js';
import { env } from './env.js';

let transporter: Transporter | null = null;

// Initialize email transporter
export const initializeEmailTransporter = (): void => {
    try {
        transporter = nodemailer.createTransport({
            host: env.EMAIL_HOST,
            port: env.EMAIL_PORT,
            secure: env.EMAIL_SECURE === 'true',
            auth: {
                user: env.EMAIL_USER,
                pass: env.EMAIL_PASSWORD,
            },
        });

        logger.info('Email Service: Email transporter initialized');
    } catch (error) {
        logger.error(
            'Email Service: Failed to initialize email transporter:',
            error,
        );
    }
};

// Get email transporter
export const getTransporter = (): Transporter | null => {
    return transporter;
};
