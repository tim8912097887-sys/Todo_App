import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { redisInstance } from '#configs/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const script = fs.readFileSync(
    path.join(__dirname, '../lua/sliding-window.lua'),
    {
        encoding: 'utf-8',
    },
);

export interface RateLimitResult {
    allowed: boolean;
    current: number;
    limit: number;
}

export async function slidingWindowCounter(
    key: string,
    windowMs = 60_000,
    limit = 100,
): Promise<RateLimitResult> {
    const result = (await redisInstance.eval(script, {
        keys: [key],
        arguments: [
            Date.now().toString(),
            windowMs.toString(),
            limit.toString(),
        ],
    })) as [number, number, number];

    return {
        allowed: result[0] === 1,
        current: Math.ceil(result[1]),
        limit: result[2],
    };
}
