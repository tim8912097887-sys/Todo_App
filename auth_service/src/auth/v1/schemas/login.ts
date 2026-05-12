import z from 'zod';

export const LoginUserSchema = z.object({
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

export type LoginUserType = z.infer<typeof LoginUserSchema>;
