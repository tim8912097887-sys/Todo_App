import z from 'zod';

export const VerifyAccountSchema = z.object({
    code: z
        .string()
        .length(6, 'OTP code must be 6 characters long')
        .regex(/^\d+$/, 'OTP code must contain only digits'),
    email: z.email('Invalid Email').trim().toLowerCase(),
});

export type VerifyAccountType = z.infer<typeof VerifyAccountSchema>;
