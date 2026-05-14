import z from 'zod';

const EnvSchema = z.object({
    // NODE_ENV Validation
    NODE_ENV: z
        .enum(['development', 'test', 'production'], {
            error: "NODE_ENV must be 'development', 'test', or 'production'",
        })
        .default('development'),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug'], {
        error: "Log level must be 'error','warn','info','debug'",
    }),
    // PORT Validation
    PORT: z.coerce
        .number({
            error: 'PORT must be a number',
        })
        .int()
        .positive('PORT must be a positive integer')
        .max(65535, 'PORT cannot exceed 65535')
        .default(3000),
    CENTRAL_LOG_TOKEN: z.string().nonempty('Central log token is required'),
    EMAIL_HOST: z.string().nonempty('Email host is required'),
    EMAIL_PORT: z.coerce
        .number({
            error: 'Email port must be a number',
        })
        .int()
        .positive('Email port must be a positive integer')
        .max(65535, 'Email port cannot exceed 65535')
        .default(587),
    EMAIL_SECURE: z.string().nonempty('Email secure is required'),
    EMAIL_USER: z.string().nonempty('Email user is required'),
    EMAIL_PASSWORD: z.string().nonempty('Email password is required'),
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
