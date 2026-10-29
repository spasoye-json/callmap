const nameOf = (user: string): string => user.trim();

const shout = (text: string): string => text.toUpperCase();

export const greet = (user: string): string => shout(`Hello ${nameOf(user)}`);
