import { faker } from '@faker-js/faker';
import { CreateUserType } from '#auth/v1/schemas/signup.js';
import { LoginUserType } from '#auth/v1/schemas/login.js';
import { IUser } from '#types/index.js';
import { db } from '#db/index.js';
import { users } from '#db/schema/user.js';
import * as passwordUtil from '#utils/password.js';
import * as otpUtil from '#utils/otp.js';
import { redisInstance } from '#configs/redis.js';
import { eq } from 'drizzle-orm';
import { AUTH_LIMITS } from '#auth/v1/constants.js';

export function getMockUser(overrides?: Partial<IUser>): IUser {
    return {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: faker.internet.email().toLowerCase(),
        username: 'testuser',
        password: 'HashedPassword123!',
        isVerified: true,
        loginAttempt: 0,
        loginLock: null,
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides,
    };
}

export function getMockCreateUserData(
    overrides?: Partial<CreateUserType>,
): CreateUserType {
    return {
        username: 'testuser',
        email: faker.internet.email().toLowerCase(),
        password: 'SecurePassword123!',
        ...overrides,
    };
}

export function getMockLoginData(
    overrides?: Partial<LoginUserType>,
): LoginUserType {
    return {
        email: faker.internet.email().toLowerCase(),
        password: 'SecurePassword123!',
        ...overrides,
    };
}

export const createTestUser = async (overrides?: {
    email?: string;
    password?: string;
    username?: string;
    emailVerifiedAt?: Date | null;
    failLoginAttempt?: number;
    loginUntil?: Date | null;
}) => {
    const email = overrides?.email ?? faker.internet.email().toLowerCase();
    const password = overrides?.password ?? 'SecurePassword123!';
    const hashedPassword = await passwordUtil.hashPassword(password);

    const [createdUser] = await db
        .insert(users)
        .values({
            username: overrides?.username ?? 'testuser',
            email,
            password: hashedPassword,
            emailVerifiedAt:
                overrides?.emailVerifiedAt === undefined
                    ? new Date()
                    : overrides.emailVerifiedAt,
            failLoginAttempt: overrides?.failLoginAttempt ?? 0,
            loginUntil: overrides?.loginUntil ?? null,
        })
        .returning({
            id: users.id,
            email: users.email,
            username: users.username,
        });

    return {
        id: createdUser.id,
        email: createdUser.email,
        username: createdUser.username,
        password,
        hashedPassword,
    };
};

export const cleanupUsers = async (emails: string[]) => {
    if (emails.length === 0) {
        return;
    }
    await Promise.all(
        emails.map((email) => db.delete(users).where(eq(users.email, email))),
    );
};

export const createTestOtp = async (userId: string, code?: string) => {
    const otpCode = code ?? otpUtil.generateOTP(6);
    const hashedCode = await otpUtil.hashOtp(otpCode);

    const otpKey = `email_verification:${userId}`;
    const cooldownKey = `email_verification:cooldown:${userId}`;

    await redisInstance.hSet(otpKey, {
        code: hashedCode,
        attempt: '0',
        createdAt: new Date().toISOString(),
    });

    await redisInstance.expire(otpKey, AUTH_LIMITS.OTP_EXPIRE_SECONDS);

    await redisInstance.set(cooldownKey, '1', {
        expiration: {
            type: 'EX',
            value: AUTH_LIMITS.OTP_RESEND_COOLDOWN_SECONDS,
        },
    });

    return otpCode;
};

export const cleanupOtps = async (userIds: string[]) => {
    if (userIds.length === 0) {
        return;
    }
    await Promise.all(
        userIds.map(async (userId) => {
            const otpKey = `email_verification:${userId}`;
            const cooldownKey = `email_verification:cooldown:${userId}`;
            await redisInstance.del(otpKey);
            await redisInstance.del(cooldownKey);
        }),
    );
};
