import { customAlphabet } from 'nanoid';

export const generateOTP = (length: number = 6): string => {
    const nanoid = customAlphabet('0123456789', length);
    return nanoid();
};
