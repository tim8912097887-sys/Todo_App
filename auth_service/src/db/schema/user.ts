import {
    pgTable,
    uuid,
    varchar,
    timestamp,
    integer,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 255 }).notNull(),
    email: varchar('email', { length: 50 }).notNull().unique(),
    password: varchar('password', { length: 255 }).notNull(),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    // loginUntil as a Date (Timestamp)
    loginUntil: timestamp('login_until', { withTimezone: true }),

    // failLoginAttempt restricted via logic, but stored as integer
    failLoginAttempt: integer('fail_login_attempt').notNull().default(0),

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
