import { users } from '#db/schema/user.js';
import { eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateUserType } from './schemas/signup.js';

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
}
