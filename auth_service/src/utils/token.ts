import { env } from '#configs/env.js';
import { logger } from '#configs/logger.js';
import { AuthPayload, Payload } from '#types/index.js';
import { jwtDecrypt, EncryptJWT } from 'jose';

export const createToken = async (
    payLoad: Payload,
    secret: string,
    expiresIn: string,
) => {
    const encryptSecret = new TextEncoder().encode(secret);
    const token = await new EncryptJWT(payLoad)
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }) // alg: 'dir' means direct encryption
        .setIssuedAt()
        .setIssuer(env.JWT_ISSUER)
        .setAudience(env.JWT_AUDIENCE)
        .setExpirationTime(expiresIn)
        .encrypt(encryptSecret);

    return token;
};

export const verifyToken = async (
    token: string,
    secret: string,
): Promise<AuthPayload> => {
    const key = new TextEncoder().encode(secret);
    try {
        const { payload } = await jwtDecrypt(token, key, {
            issuer: env.JWT_ISSUER,
            audience: env.JWT_AUDIENCE,
        });
        return payload as unknown as AuthPayload;
    } catch (err: any) {
        logger.error(`JWT Decryption Error: ${err}`);
        throw err;
    }
};
