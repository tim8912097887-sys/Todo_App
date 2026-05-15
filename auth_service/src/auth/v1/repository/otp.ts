import { AUTH_LIMITS } from '#auth/v1/constants.js';
import { TooManyRequestError } from '#errors/too-many-request.js';
import { CreateOtpInfo, GetOtpInfo } from '#types/index.js';
import { RedisClientType } from 'redis';

export class OtpRepository {
    constructor(private readonly cacheDb: RedisClientType) {}

    private getOtpKey(getOtpInfo: GetOtpInfo) {
        return `${getOtpInfo.otpType}:${getOtpInfo.userId}`;
    }

    private getCooldownKey(getOtpInfo: GetOtpInfo) {
        return `${getOtpInfo.otpType}:cooldown:${getOtpInfo.userId}`;
    }

    public async createOtp(createOtpInfo: CreateOtpInfo) {
        const otpKey = this.getOtpKey(createOtpInfo);

        const cooldownKey = this.getCooldownKey(createOtpInfo);

        const cooldownExists = await this.cacheDb.exists(cooldownKey);

        if (cooldownExists) {
            throw new TooManyRequestError(
                'Please wait before requesting another verification code.',
            );
        }

        await this.cacheDb.hSet(otpKey, {
            code: createOtpInfo.code,
            attempt: '0',
            createdAt: new Date().toISOString(),
        });

        await this.cacheDb.expire(otpKey, AUTH_LIMITS.OTP_EXPIRE_SECONDS);

        await this.cacheDb.set(cooldownKey, '1', {
            expiration: {
                type: 'EX',
                value: AUTH_LIMITS.OTP_RESEND_COOLDOWN_SECONDS,
            },
        });

        return 'OK';
    }

    public async getOtp(getOtpInfo: GetOtpInfo) {
        const otpKey = this.getOtpKey(getOtpInfo);

        const result = await this.cacheDb.hGetAll(otpKey);

        if (Object.keys(result).length === 0) {
            return null;
        }

        return {
            code: result.code,
            attempt: Number(result.attempt),
            createdAt: result.createdAt,
        };
    }

    public async incrementOtpAttempt(getOtpInfo: GetOtpInfo) {
        const otpKey = this.getOtpKey(getOtpInfo);

        const attempt = await this.cacheDb.hIncrBy(otpKey, 'attempt', 1);

        if (attempt >= AUTH_LIMITS.OTP_MAX_ATTEMPTS) {
            await this.cacheDb.del(otpKey);
        }

        return attempt;
    }

    public async deleteOtp(getOtpInfo: GetOtpInfo) {
        return await this.cacheDb.del(this.getOtpKey(getOtpInfo));
    }

    public async getCooldownTtl(getOtpInfo: GetOtpInfo) {
        return await this.cacheDb.ttl(this.getCooldownKey(getOtpInfo));
    }

    public async otpExists(getOtpInfo: GetOtpInfo) {
        return await this.cacheDb.exists(this.getOtpKey(getOtpInfo));
    }
}
