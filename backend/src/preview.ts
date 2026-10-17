import nodemailer from "nodemailer";
export const getPreview = (info: unknown): string | null => (nodemailer.getTestMessageUrl(info as never) as string | false) || null;
