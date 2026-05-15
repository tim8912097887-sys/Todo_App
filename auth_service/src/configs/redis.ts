import { createClient, RedisClientType } from 'redis';
import { env } from './env.js';
import { logger } from './logger.js';

class RedisClient {
    private static instance: RedisClientType;
    private static isConnected = false;

    // Prevent outside instantiation
    private constructor() {}

    public static getInstance(): RedisClientType {
        if (!this.instance) {
            this.instance = createClient({
                url: env.REDIS_URL,
                socket: {
                    reconnectStrategy: (retries: number) => {
                        const delay = Math.min(retries * 50, 2000);
                        return delay;
                    },
                },
            });

            RedisClient.setupEventListeners();

            // Connect immediately
            this.instance.connect().catch((error) => {
                logger.error('Redis initial connection failed:', error);
            });
        }

        return this.instance;
    }

    private static setupEventListeners(): void {
        RedisClient.instance.on('connect', () => {
            RedisClient.isConnected = true;
            logger.info('Connected to Redis');
        });

        RedisClient.instance.on('ready', () => {
            logger.info('Redis client is ready');
        });

        RedisClient.instance.on('error', (error: unknown) => {
            RedisClient.isConnected = false;
            logger.error('Redis connection error:', error);
        });

        RedisClient.instance.on('reconnecting', () => {
            logger.info('Reconnecting to Redis...');
        });

        RedisClient.instance.on('end', () => {
            RedisClient.isConnected = false;
            logger.info('Redis connection ended');
        });
    }

    public static async closeConnection(): Promise<void> {
        if (this.instance) {
            try {
                await RedisClient.instance.quit();
                logger.info('Redis connection closed');
            } catch (error) {
                logger.error(`Redis connection close error: `, error);
            }
        }
    }

    public static isReady(): boolean {
        return RedisClient.isConnected;
    }
}

const redisInstance = RedisClient.getInstance();

export { redisInstance, RedisClient };
