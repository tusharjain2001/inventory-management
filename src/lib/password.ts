import bcrypt from "bcryptjs";

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const PASSWORD_RULE = "Password must be at least 8 characters";
export const isStrongEnough = (password: string) => password.length >= 8;
