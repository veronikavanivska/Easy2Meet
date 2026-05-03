"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

function buildVoteUrl(
    token: string,
    params: {
        email?: string;
        error?: string;
        success?: string;
    }
) {
    const searchParams = new URLSearchParams();

    if (params.email) searchParams.set("email", params.email);
    if (params.error) searchParams.set("error", params.error);
    if (params.success) searchParams.set("success", params.success);

    const query = searchParams.toString();

    return query ? `/vote/${token}?${query}` : `/vote/${token}`;
}

function redirectWithError(
    token: string,
    message: string,
    email?: string
): never {
    redirect(buildVoteUrl(token, { email, error: message }));
}

function redirectWithSuccess(
    token: string,
    message: string,
    email?: string
): never {
    redirect(buildVoteUrl(token, { email, success: message }));
}

type EventRecord = {
    id: string;
    status: string;
    voting_deadline: string | null;
};

async function closeEventIfDeadlinePassed<T extends EventRecord>(
    event: T
): Promise<T> {
    if (event.status !== "voting") return event;
    if (!event.voting_deadline) return event;

    const deadline = new Date(event.voting_deadline);

    if (deadline > new Date()) return event;

    const supabase = createSupabaseAdminClient();

    const { data: updatedEvent } = await supabase
        .from("events")
        .update({
            status: "closed",
        })
        .eq("id", event.id)
        .select("*")
        .single();

    return (updatedEvent as T | null) ?? event;
}

async function getEventByToken(token: string) {
    const supabase = createSupabaseAdminClient();

    const { data: event, error } = await supabase
        .from("events")
        .select("*")
        .eq("public_token", token)
        .single();

    if (error || !event) return null;

    return await closeEventIfDeadlinePassed(event as EventRecord & Record<string, unknown>);
}

async function getParticipantByEmail(eventId: string, email: string) {
    const supabase = createSupabaseAdminClient();

    const { data: participant, error } = await supabase
        .from("participants")
        .select("*")
        .eq("event_id", eventId)
        .eq("email", email)
        .maybeSingle();

    if (error || !participant) return null;

    return participant;
}

async function closeEventIfEveryoneVoted(eventId: string) {
    const supabase = createSupabaseAdminClient();

    const { data: event } = await supabase
        .from("events")
        .select("id, status")
        .eq("id", eventId)
        .single();

    if (!event || event.status !== "voting") {
        return;
    }

    const { data: participants } = await supabase
        .from("participants")
        .select("id")
        .eq("event_id", eventId);

    if (!participants || participants.length === 0) {
        return;
    }

    const { data: timeOptions } = await supabase
        .from("time_options")
        .select("id")
        .eq("event_id", eventId);

    const { data: placeOptions } = await supabase
        .from("place_options")
        .select("id")
        .eq("event_id", eventId);

    if (!timeOptions || timeOptions.length === 0) {
        return;
    }

    if (!placeOptions || placeOptions.length === 0) {
        return;
    }

    const { data: timeVotes } = await supabase
        .from("time_votes")
        .select("participant_id, time_option_id")
        .eq("event_id", eventId);

    const { data: placeVotes } = await supabase
        .from("place_votes")
        .select("participant_id, place_option_id")
        .eq("event_id", eventId);

    const allTimeVotes = timeVotes ?? [];
    const allPlaceVotes = placeVotes ?? [];

    const everyoneVotedForEveryOption = participants.every((participant) => {
        const participantTimeVotes = allTimeVotes.filter(
            (vote) => vote.participant_id === participant.id
        );

        const participantPlaceVotes = allPlaceVotes.filter(
            (vote) => vote.participant_id === participant.id
        );

        const votedTimeOptionIds = new Set(
            participantTimeVotes.map((vote) => vote.time_option_id)
        );

        const votedPlaceOptionIds = new Set(
            participantPlaceVotes.map((vote) => vote.place_option_id)
        );

        const votedForAllTimeOptions = timeOptions.every((option) =>
            votedTimeOptionIds.has(option.id)
        );

        const votedForAllPlaceOptions = placeOptions.every((option) =>
            votedPlaceOptionIds.has(option.id)
        );

        return votedForAllTimeOptions && votedForAllPlaceOptions;
    });

    if (!everyoneVotedForEveryOption) {
        return;
    }

    await supabase
        .from("events")
        .update({
            status: "closed",
        })
        .eq("id", eventId);
}

export async function identifyParticipantAction(formData: FormData) {
    const token = String(formData.get("token") || "");
    const email = normalizeEmail(String(formData.get("email") || ""));

    if (!token) redirect("/");

    if (!email) redirectWithError(token, "Podaj adres e-mail.");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        redirectWithError(token, "Podaj poprawny adres e-mail.");
    }

    const event = await getEventByToken(token);

    if (!event) redirectWithError(token, "Nie znaleziono wydarzenia.");

    const participant = await getParticipantByEmail(event.id, email);

    if (!participant) {
        redirectWithError(
            token,
            "Ten e-mail nie znajduje się na liście uczestników wydarzenia."
        );
    }

    redirectWithSuccess(token, "Uczestnik został rozpoznany.", email);
}

export async function proposeTimeOptionAction(formData: FormData) {
    const token = String(formData.get("token") || "");
    const participantEmail = normalizeEmail(
        String(formData.get("participantEmail") || "")
    );
    const startsAtRaw = String(formData.get("startsAt") || "");
    const endsAtRaw = String(formData.get("endsAt") || "");

    if (!token) redirect("/");

    if (!participantEmail) {
        redirectWithError(token, "Najpierw potwierdź swój e-mail.");
    }

    if (!startsAtRaw) {
        redirectWithError(
            token,
            "Termin rozpoczęcia jest wymagany.",
            participantEmail
        );
    }

    const event = await getEventByToken(token);

    if (!event) {
        redirectWithError(token, "Nie znaleziono wydarzenia.", participantEmail);
    }

    if (event.status !== "voting") {
        redirectWithError(
            token,
            "Głosowanie nie jest aktualnie aktywne.",
            participantEmail
        );
    }

    const participant = await getParticipantByEmail(event.id, participantEmail);

    if (!participant) {
        redirectWithError(
            token,
            "Ten e-mail nie znajduje się na liście uczestników wydarzenia.",
            participantEmail
        );
    }

    const startsAt = new Date(startsAtRaw);
    const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

    if (Number.isNaN(startsAt.getTime())) {
        redirectWithError(
            token,
            "Nieprawidłowa data rozpoczęcia.",
            participantEmail
        );
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
        redirectWithError(
            token,
            "Nieprawidłowa data zakończenia.",
            participantEmail
        );
    }

    if (endsAt && endsAt <= startsAt) {
        redirectWithError(
            token,
            "Data zakończenia musi być późniejsza niż data rozpoczęcia.",
            participantEmail
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingTimeOption } = await supabase
        .from("time_options")
        .select("id")
        .eq("event_id", event.id)
        .eq("starts_at", startsAt.toISOString())
        .maybeSingle();

    if (existingTimeOption) {
        redirectWithError(token, "Taki termin już istnieje.", participantEmail);
    }

    const { error } = await supabase.from("time_options").insert({
        event_id: event.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt ? endsAt.toISOString() : null,
    });

    if (error) redirectWithError(token, error.message, participantEmail);

    revalidatePath(`/vote/${token}`);
    redirectWithSuccess(
        token,
        "Twoja propozycja terminu została dodana.",
        participantEmail
    );
}

export async function proposePlaceOptionAction(formData: FormData) {
    const token = String(formData.get("token") || "");
    const participantEmail = normalizeEmail(
        String(formData.get("participantEmail") || "")
    );
    const name = String(formData.get("name") || "").trim();
    const address = String(formData.get("address") || "").trim();

    if (!token) redirect("/");

    if (!participantEmail) {
        redirectWithError(token, "Najpierw potwierdź swój e-mail.");
    }

    if (!name) {
        redirectWithError(token, "Nazwa miejsca jest wymagana.", participantEmail);
    }

    const event = await getEventByToken(token);

    if (!event) {
        redirectWithError(token, "Nie znaleziono wydarzenia.", participantEmail);
    }

    if (event.status !== "voting") {
        redirectWithError(
            token,
            "Głosowanie nie jest aktualnie aktywne.",
            participantEmail
        );
    }

    const participant = await getParticipantByEmail(event.id, participantEmail);

    if (!participant) {
        redirectWithError(
            token,
            "Ten e-mail nie znajduje się na liście uczestników wydarzenia.",
            participantEmail
        );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("place_options").insert({
        event_id: event.id,
        name,
        address,
    });

    if (error) redirectWithError(token, error.message, participantEmail);

    revalidatePath(`/vote/${token}`);
    redirectWithSuccess(
        token,
        "Twoja propozycja miejsca została dodana.",
        participantEmail
    );
}

export async function voteForTimeAction(formData: FormData) {
    const token = String(formData.get("token") || "");
    const eventId = String(formData.get("eventId") || "");
    const participantId = String(formData.get("participantId") || "");
    const participantEmail = normalizeEmail(
        String(formData.get("participantEmail") || "")
    );
    const timeOptionId = String(formData.get("timeOptionId") || "");
    const vote = String(formData.get("vote") || "");

    if (!token) redirect("/");

    if (!eventId || !participantId || !timeOptionId || !participantEmail) {
        redirectWithError(token, "Brakuje danych głosowania.", participantEmail);
    }

    if (!["yes", "maybe", "no"].includes(vote)) {
        redirectWithError(token, "Nieprawidłowa wartość głosu.", participantEmail);
    }

    const event = await getEventByToken(token);

    if (!event || event.id !== eventId) {
        redirectWithError(token, "Nie znaleziono wydarzenia.", participantEmail);
    }

    if (event.status !== "voting") {
        redirectWithError(
            token,
            "Głosowanie nie jest aktualnie aktywne.",
            participantEmail
        );
    }

    const participant = await getParticipantByEmail(eventId, participantEmail);

    if (!participant || participant.id !== participantId) {
        redirectWithError(
            token,
            "Nie możesz głosować w tym wydarzeniu jako ten uczestnik.",
            participantEmail
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: option } = await supabase
        .from("time_options")
        .select("id")
        .eq("id", timeOptionId)
        .eq("event_id", eventId)
        .maybeSingle();

    if (!option) {
        redirectWithError(
            token,
            "Nie znaleziono wybranego terminu.",
            participantEmail
        );
    }

    const { error } = await supabase.from("time_votes").upsert(
        {
            event_id: eventId,
            time_option_id: timeOptionId,
            participant_id: participantId,
            vote,
        },
        {
            onConflict: "time_option_id,participant_id",
        }
    );

    if (error) redirectWithError(token, error.message, participantEmail);

    await closeEventIfEveryoneVoted(eventId);

    revalidatePath(`/vote/${token}`);
    redirectWithSuccess(token, "Głos na termin został zapisany.", participantEmail);
}

export async function voteForPlaceAction(formData: FormData) {
    const token = String(formData.get("token") || "");
    const eventId = String(formData.get("eventId") || "");
    const participantId = String(formData.get("participantId") || "");
    const participantEmail = normalizeEmail(
        String(formData.get("participantEmail") || "")
    );
    const placeOptionId = String(formData.get("placeOptionId") || "");
    const vote = String(formData.get("vote") || "");

    if (!token) redirect("/");

    if (!eventId || !participantId || !placeOptionId || !participantEmail) {
        redirectWithError(token, "Brakuje danych głosowania.", participantEmail);
    }

    if (!["yes", "maybe", "no"].includes(vote)) {
        redirectWithError(token, "Nieprawidłowa wartość głosu.", participantEmail);
    }

    const event = await getEventByToken(token);

    if (!event || event.id !== eventId) {
        redirectWithError(token, "Nie znaleziono wydarzenia.", participantEmail);
    }

    if (event.status !== "voting") {
        redirectWithError(
            token,
            "Głosowanie nie jest aktualnie aktywne.",
            participantEmail
        );
    }

    const participant = await getParticipantByEmail(eventId, participantEmail);

    if (!participant || participant.id !== participantId) {
        redirectWithError(
            token,
            "Nie możesz głosować w tym wydarzeniu jako ten uczestnik.",
            participantEmail
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: option } = await supabase
        .from("place_options")
        .select("id")
        .eq("id", placeOptionId)
        .eq("event_id", eventId)
        .maybeSingle();

    if (!option) {
        redirectWithError(
            token,
            "Nie znaleziono wybranego miejsca.",
            participantEmail
        );
    }

    const { error } = await supabase.from("place_votes").upsert(
        {
            event_id: eventId,
            place_option_id: placeOptionId,
            participant_id: participantId,
            vote,
        },
        {
            onConflict: "place_option_id,participant_id",
        }
    );

    if (error) redirectWithError(token, error.message, participantEmail);

    await closeEventIfEveryoneVoted(eventId);

    revalidatePath(`/vote/${token}`);
    redirectWithSuccess(
        token,
        "Głos na miejsce został zapisany.",
        participantEmail
    );
}
