import RabbitMQ from '@tim_madule/rabbitmq';
import { env } from './env.js';
import {
    handleSignupEmail,
    handleSignupVerifiedEmail,
} from '#services/auth.js';
import { logger } from './logger.js';

const QUEUE_NAME = ['signup_email', 'signup_verified_email'];
const QUEUE_FUNCTIONS = {
    signup_email: handleSignupEmail,
    signup_verified_email: handleSignupVerifiedEmail,
};

const rabbitMQInstance = new RabbitMQ({
    url: env.RABBITMQ_URL,
    serviceName: 'Email_Service',
    queues: QUEUE_NAME,
});

export const connectRabbitMQ = async () => {
    await rabbitMQInstance.connect();
};

export const consumeEmailQueue = async () => {
    let isSuccess: boolean;
    for (const queue of QUEUE_NAME) {
        isSuccess = await rabbitMQInstance.consumeFromQueue(
            queue,
            QUEUE_FUNCTIONS[queue as keyof typeof QUEUE_FUNCTIONS],
            { noAck: false },
        );
        if (!isSuccess) {
            logger.error(`Failed to consume from queue: ${queue}`);
            throw new Error(`Failed to consume from queue: ${queue}`);
        }
    }
};

export const disconnectRabbitMQ = async () => {
    await rabbitMQInstance.close();
};
