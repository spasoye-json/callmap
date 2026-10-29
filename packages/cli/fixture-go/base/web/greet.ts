const nameOf = (user: string): string => user.trim();

export const greet = (user: string): string => `Hello ${nameOf(user)}`;
