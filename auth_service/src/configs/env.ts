import z from 'zod';

const EnvSchema = z.object({
    // NODE_ENV Validation
    NODE_ENV: z
        .enum(['development', 'test', 'production'], {
            error: "NODE_ENV must be 'development', 'test', or 'production'",
        })
        .default('development'),

    // PORT Validation
    PORT: z.coerce
        .number({
            error: 'PORT must be a number',
        })
        .int()
        .positive('PORT must be a positive integer')
        .max(65535, 'PORT cannot exceed 65535')
        .default(3000),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug'], {
        error: "Log level must be 'error','warn','info','debug'",
    }),
    CENTRAL_LOG_TOKEN: z.string().nonempty('Central log token is required'),
    DATABASE_URL: z
        .string()
        .regex(
            /^postgresql:\/\/(?:([^:\s]+):([^@\s]+)@)?([^:/\s]+)(?::(\d+))?\/([^\s?]+)(?:\?(.+))?$/,
            'Database URL is invalid',
        ),
    JWT_ISSUER: z.url('JWT_ISSUER must be a valid URL'),
    JWT_AUDIENCE: z.url('JWT_AUDIENCE must be a valid URL'),
    TOKEN_SECRET: z
        .string()
        .length(32, 'TOKEN_SECRET must be exactly 32 characters'),
    TOKEN_EXPIRES_IN: z
        .string()
        .regex(
            /^\d+[smhd]$/,
            'TOKEN_EXPIRES_IN must be a string like "15m", "1h", "2d"',
        ),
    RABBITMQ_URL: z.string().nonempty('RabbitMQ URL is required'),
});

const result = EnvSchema.safeParse(process.env);
// Stop the application by throw error
if (!result.success) {
    const errorMessage = result.error.issues
        .map((issue) => issue.message)
        .join(', ');
    console.error(`Environment variables Error: ${errorMessage}`);
    // Should exit when env not available
    process.exit(1);
}
// Validated data
export const env = result.data;
