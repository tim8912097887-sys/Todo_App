import RabbitMQ from '@tim_madule/rabbitmq';
import { env } from './env.js';
import { logger } from './logger.js';
import { subscribeShutdown } from '#utils/shutdown.js';

export const QUEUE_NAME = ['signup_email', 'signup_verified_email'];

const rabbitMQInstance = new RabbitMQ({
    url: env.RABBITMQ_URL,
    serviceName: 'Auth_Service',
    queues: QUEUE_NAME,
});

export const connectRabbitMQ = async () => {
    await rabbitMQInstance.connect();
    subscribeShutdown(disconnectRabbitMQ);
};

export const sendToQueue = async (queueName: string, message: any) => {
    const isSuccess = await rabbitMQInstance.sendToQueue(queueName, message);
    if (!isSuccess) {
        logger.error(`Failed to send to queue: ${queueName}`);
        throw new Error(`Failed to send to queue: ${queueName}`);
    }
};

const disconnectRabbitMQ = async () => {
    await rabbitMQInstance.close();
};
