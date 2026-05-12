import { compare, genSalt, hash } from 'bcrypt-ts';

export const hashPassword = async (password: string, saltRound = 10) => {
    const salt = await genSalt(saltRound);
    const hashedPassword = await hash(password, salt);
    return hashedPassword;
};

export const comparePassword = async (
    password: string,
    hashedPassword: string,
) => {
    const isMatch = await compare(password, hashedPassword);
    return isMatch;
};
