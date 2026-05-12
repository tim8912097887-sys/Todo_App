import {
    pgTable,
    uuid,
    varchar,
    boolean,
    timestamp,
    integer,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 255 }).notNull(),
    email: varchar('email', { length: 50 }).notNull().unique(),
    password: varchar('password', { length: 255 }).notNull(),

    isVerified: boolean('is_verified').notNull().default(false),

    // loginLock as a Date (Timestamp)
    loginLock: timestamp('login_lock', { withTimezone: true }),

    // loginAttempt restricted via logic, but stored as integer
    loginAttempt: integer('login_attempt').notNull().default(0),

    tokenVersion: integer('token_version').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
