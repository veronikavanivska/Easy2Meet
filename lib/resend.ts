import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);

export function getFromEmail() {
    return process.env.RESEND_FROM_EMAIL || "Easy2Meet <onboarding@resend.dev>";
}

export function getAppUrl() {
    return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}