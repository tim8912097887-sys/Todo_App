import { RedisClientType } from 'redis';

export class TokenRepository {
    constructor(private readonly cacheDb: RedisClientType) {}

    public async blacklistToken(blacklistInfo: { jti: string; exp: number }) {
        const { jti, exp } = blacklistInfo;
        await this.cacheDb.set(`jti_${jti}`, 'blacklisted', {
            expiration: {
                type: 'EX',
                value: exp,
            },
        });
    }
}
