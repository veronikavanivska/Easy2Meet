import nodemailer from "nodemailer";

type SendEmailInput = {
    to: string;
    subject: string;
    html: string;
};

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        throw new Error("Missing SMTP environment variables");
    }

    return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
            user,
            pass,
        },
    });
}

export async function sendEmail({ to, subject, html }: SendEmailInput) {
    const from = process.env.SMTP_FROM;

    if (!from) {
        throw new Error("Missing SMTP_FROM environment variable");
    }

    const transporter = createTransporter();

    await transporter.sendMail({
        from,
        to,
        subject,
        html,
    });
}

export function getAppUrl() {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}