import { getTransporter } from '#configs/email.js';
import { logger } from '#configs/logger.js';

type EmailOptions = {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
};

export const sendEmail = async (options: EmailOptions) => {
    const transporter = getTransporter();
    if (!transporter) {
        throw new Error('Email transporter is not initialized');
    }
    try {
        await transporter.sendMail(options);
        logger.info(
            `Email sent to ${options.to} with subject "${options.subject}"`,
        );
        logger.debug(`Email content: ${options.text || options.html}`);
        return true;
    } catch (error) {
        logger.error('Error sending email:', error);
        throw error;
    }
};
