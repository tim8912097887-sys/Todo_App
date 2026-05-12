import z from 'zod';

// Helper to strip out common HTML/Script tags
const stripDangerousChars = (val: string) =>
    val.replace(/[<>'"/;(){}[\]]/g, '').trim();

export const CreateUserSchema = z.object({
    username: z
        .string()
        .min(2, 'Username must be at least 2 characters')
        .max(50, 'Username too long')
        .regex(/^[A-Za-z0-9]+$/, 'Username only allow A-Z,a-z and 0-9')
        .toLowerCase()
        .transform(stripDangerousChars), // Sanitize
    email: z.email('Invalid Email').trim().toLowerCase(),
    password: z
        .string()
        .min(8, 'Password at least eight character')
        .max(50, 'Password at most fifty character')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/,
            'Password should include small and big letter and number and one special character',
        ),
});

export type CreateUserType = z.infer<typeof CreateUserSchema>;
