import { pgTable, varchar, uuid, timestamp, index } from 'drizzle-orm/pg-core';

export const otps = pgTable(
    'otps',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        // Using varchar(6) to prevent losing leading zeros (e.g., "001234")
        code: varchar('code', { length: 6 }).notNull(),

        // The User ID from your users table
        userId: uuid('user_id').notNull(),

        // Automatically sets the time when the record is created
        createdAt: timestamp('created_at').defaultNow().notNull(),

        // Nullable field for soft deletes
        deletedAt: timestamp('deleted_at'),
    },
    (table) => {
        return [index('user_code_idx').on(table.userId, table.code)];
    },
);
