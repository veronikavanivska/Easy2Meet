import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
    title: "Easy2Meet",
    description: "Aplikacja do wspólnego ustalania terminu i miejsca spotkania",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: ReactNode;
}>) {
    return (
        <ClerkProvider
            signInUrl="/sign-in"
            signUpUrl="/sign-up"
            signInFallbackRedirectUrl="/dashboard"
            signUpFallbackRedirectUrl="/dashboard"
        >
            <html lang="pl">
            <body className="bg-slate-50 text-slate-900 antialiased">
            {children}
            </body>
            </html>
        </ClerkProvider>
    );
}