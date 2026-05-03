"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectWithError(message: string): never {
    redirect(`/events/new?error=${encodeURIComponent(message)}`);
}

export async function createEventAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();

    if (!title) {
        redirectWithError("Tytuł wydarzenia jest wymagany.");
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
        .from("events")
        .insert({
            title,
            description,
            organizer_id: userId,
            status: "draft",
        })
        .select("id")
        .single();

    if (error) {
        redirectWithError(error.message);
    }

    redirect(`/events/${data.id}`);
}