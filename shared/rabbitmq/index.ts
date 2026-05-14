import amqp from 'amqplib';

type RabbitMQParameters = {
    url?: string;
    serviceName?: string;
    queues?: string[];
};

class RabbitMQ {
    private connection: any; // Placeholder for the actual connection type
    private channel: any; // Placeholder for the actual channel type
    constructor(private config: RabbitMQParameters = {}) {}

    async connect() {
        const serviceName = this.config.serviceName || 'UnknownService';
        const MAX_RETRIES = 5;
        let retryCount = 0;
        while (retryCount < MAX_RETRIES) {
            try {
                this.connection = await amqp.connect(
                    this.config.url || 'amqp://localhost:5672',
                );
                this.channel = await this.connection.createChannel();
                if (this.config.queues) {
                    for (const queue of this.config.queues) {
                        await this.channel.assertQueue(queue, {
                            durable: true,
                        });
                    }
                }
                console.log(
                    `Connected to RabbitMQ for service: ${serviceName}`,
                );
                return;
            } catch (error) {
                console.error(
                    `Error connecting to RabbitMQ for service ${serviceName}:`,
                    error,
                );
                retryCount++;
                if (retryCount < MAX_RETRIES) {
                    console.log(
                        `Retrying connection to RabbitMQ for service ${serviceName} in 5 seconds...`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }
            }
        }
    }

    async sendToQueue(queue: string, message: any) {
        try {
            if (!this.channel) {
                console.error(
                    'Channel is not initialized. Call connect() first.',
                );
                return false;
            }
            await this.channel.sendToQueue(
                queue,
                Buffer.from(JSON.stringify(message)),
                { persistent: true },
            );
            console.log(`Message sent to queue ${queue}:`, message);
            return true;
        } catch (error) {
            console.error('Error sending message to queue:', error);
            return false;
        }
    }

    async consumeFromQueue(
        queue: string,
        callback: (message: any) => Promise<void>,
        options: { noAck?: boolean } = { noAck: false },
    ) {
        try {
            if (!this.channel) {
                console.error(
                    'Channel is not initialized. Call connect() first.',
                );
                return false;
            }
            await this.channel.consume(queue, async (message: any) => {
                if (message) {
                    try {
                        await callback(JSON.parse(message.content.toString()));
                        if (!options.noAck) {
                            await this.channel.ack(message);
                        }
                    } catch (error) {
                        console.error('Error processing message:', error);
                    }
                }
            });
            console.log(`Consuming from queue ${queue}`);
            return true;
        } catch (error) {
            console.error('Error consuming from queue:', error);
            return false;
        }
    }

    getChannel() {
        return this.channel;
    }

    isConnected() {
        return !!this.connection && !!this.channel;
    }

    async close() {
        try {
            if (this.channel) {
                await this.channel.close();
                this.channel = null;
                console.log('RabbitMQ channel closed.');
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
                console.log('RabbitMQ connection closed.');
            }
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }
}

export default RabbitMQ;
