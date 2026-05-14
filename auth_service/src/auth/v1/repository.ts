import { users } from '#db/schema/user.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateUserType } from './schemas/signup.js';
import { otps } from '#db/schema/otp.js';

export class AuthRepository {
    constructor(private readonly db: NodePgDatabase) {}

    public async findUserByEmail(email: string) {
        return this.db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
                loginAttempt: users.loginAttempt,
                loginLock: users.loginLock,
                isVerified: users.isVerified,
                password: users.password,
                tokenVersion: users.tokenVersion,
            })
            .from(users)
            .where(eq(users.email, email));
    }

    public async createUser(user: CreateUserType) {
        return this.db.insert(users).values(user).returning({
            id: users.id,
            email: users.email,
            username: users.username,
        });
    }

    public async findUserById(id: string) {
        return this.db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
            })
            .from(users)
            .where(eq(users.id, id));
    }

    public async setLoginAttempt(email: string, attempt: number) {
        return this.db
            .update(users)
            .set({
                loginAttempt: sql`${attempt}`,
            })
            .where(eq(users.email, email));
    }

    public async setLoginLock(email: string, lockTime: Date) {
        return this.db
            .update(users)
            .set({
                loginLock: sql`${lockTime}`,
            })
            .where(eq(users.email, email));
    }

    public async resetLoginAttemptAndLock(email: string) {
        return this.db
            .update(users)
            .set({
                loginAttempt: sql`0`,
                loginLock: sql`NULL`,
            })
            .where(eq(users.email, email));
    }

    public async deleteUserById(id: string) {
        return this.db
            .update(users)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(users.id, id));
    }

    public async createOtp(userId: string, code: string) {
        return this.db
            .insert(otps)
            .values({
                userId,
                code,
            })
            .returning({
                code: otps.code,
            });
    }

    public async deleteOtpByUserId(id: string, otpCode: string) {
        return this.db
            .update(otps)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(otps.userId, id), eq(otps.code, otpCode)));
    }

    public async verifyUser(id: string, otpCode: string) {
        const [otp] = await this.db
            .select({
                id: otps.id,
            })
            .from(otps)
            .where(
                and(
                    eq(otps.userId, id),
                    eq(otps.code, otpCode),
                    isNull(otps.deletedAt),
                ),
            );
        if (!otp) {
            return null;
        }
        return this.db
            .update(users)
            .set({
                isVerified: sql`true`,
            })
            .where(eq(users.id, id));
    }
}
