import { compare, hash } from 'bcrypt-ts';
import { customAlphabet } from 'nanoid';

export const generateOTP = (length: number = 6): string => {
    const nanoid = customAlphabet('0123456789', length);
    return nanoid();
};

export const hashOtp = async (otp: string, saltRound = 10): Promise<string> => {
    // Implement your hashing logic here, e.g., using bcrypt
    const hashedOtp = await hash(otp, saltRound);
    return hashedOtp;
};

export const compareOtp = async (
    otp: string,
    hashedOtp: string,
): Promise<boolean> => {
    // Implement your comparison logic here, e.g., using bcrypt
    const isMatch = await compare(otp, hashedOtp);
    return isMatch;
};
