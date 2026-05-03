"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type StatusMessageProps = {
    error?: string;
    success?: string;
    durationMs?: number;
};

export function StatusMessage({
                                  error,
                                  success,
                                  durationMs = 4000,
                              }: StatusMessageProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!error && !success) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString());

            params.delete("error");
            params.delete("success");

            const newUrl = params.toString()
                ? `${pathname}?${params.toString()}`
                : pathname;

            router.replace(newUrl, {
                scroll: false,
            });
        }, durationMs);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [error, success, durationMs, pathname, router, searchParams]);

    if (!error && !success) {
        return null;
    }

    if (error) {
        return (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm font-medium text-red-700 shadow-sm backdrop-blur-xl">
                {error}
            </div>
        );
    }

    return (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm font-medium text-emerald-700 shadow-sm backdrop-blur-xl">
            {success}
        </div>
    );
}