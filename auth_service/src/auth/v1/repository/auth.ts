import { users } from '#db/schema/user.js';
import { eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateUserType } from '../schemas/signup.js';

export class AuthRepository {
    constructor(private readonly db: NodePgDatabase) {}

    public async findUserByEmail(email: string) {
        return this.db
            .select({
                id: users.id,
                email: users.email,
                username: users.username,
                failLoginAttempt: users.failLoginAttempt,
                loginUntil: users.loginUntil,
                emailVerifiedAt: users.emailVerifiedAt,
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
                tokenVersion: users.tokenVersion,
            })
            .from(users)
            .where(eq(users.id, id));
    }

    public async updateLoginSecurityState(
        email: string,
        data: {
            attempt: number;
            lockUntil: Date | null;
        },
    ) {
        return this.db
            .update(users)
            .set({
                failLoginAttempt: data.attempt,
                loginUntil: data.lockUntil,
            })
            .where(eq(users.email, email));
    }

    public async resetLoginAttemptAndLock(email: string) {
        return this.db
            .update(users)
            .set({
                failLoginAttempt: 0,
                loginUntil: null,
            })
            .where(eq(users.email, email));
    }

    public async incrementTokenVersion(userId: string) {
        return this.db
            .update(users)
            .set({
                tokenVersion: sql`${users.tokenVersion} + 1`,
            })
            .where(eq(users.id, userId));
    }

    public async updateUserEmailVerifiedAt(userId: string) {
        return this.db
            .update(users)
            .set({
                emailVerifiedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(users.id, userId));
    }
}
