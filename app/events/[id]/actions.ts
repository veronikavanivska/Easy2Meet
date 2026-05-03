"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, getFromEmail, resend } from "@/lib/resend";

function redirectWithError(eventId: string, message: string): never {
    redirect(`/events/${eventId}?error=${encodeURIComponent(message)}`);
}

function redirectWithSuccess(eventId: string, message: string): never {
    redirect(`/events/${eventId}?success=${encodeURIComponent(message)}`);
}

async function assertEventOwner(eventId: string, userId: string) {
    const supabase = createSupabaseAdminClient();

    const { data: event, error } = await supabase
        .from("events")
        .select("id, title, organizer_id, public_token, status, voting_deadline")
        .eq("id", eventId)
        .eq("organizer_id", userId)
        .single();

    if (error || !event) {
        redirectWithError(eventId, "Nie masz dostępu do tego wydarzenia.");
    }

    return event;
}

export async function addTimeOptionAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const startsAtRaw = String(formData.get("startsAt") || "");
    const endsAtRaw = String(formData.get("endsAt") || "");

    if (!eventId) redirect("/dashboard");

    if (!startsAtRaw) {
        redirectWithError(eventId, "Termin rozpoczęcia jest wymagany.");
    }

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Terminy można dodawać tylko przed rozpoczęciem głosowania."
        );
    }

    const startsAt = new Date(startsAtRaw);
    const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;

    if (Number.isNaN(startsAt.getTime())) {
        redirectWithError(eventId, "Nieprawidłowa data rozpoczęcia.");
    }

    if (endsAt && Number.isNaN(endsAt.getTime())) {
        redirectWithError(eventId, "Nieprawidłowa data zakończenia.");
    }

    if (endsAt && endsAt <= startsAt) {
        redirectWithError(
            eventId,
            "Data zakończenia musi być późniejsza niż data rozpoczęcia."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingTimeOption } = await supabase
        .from("time_options")
        .select("id")
        .eq("event_id", eventId)
        .eq("starts_at", startsAt.toISOString())
        .maybeSingle();

    if (existingTimeOption) {
        redirectWithError(eventId, "Taki termin został już dodany.");
    }

    const { error } = await supabase.from("time_options").insert({
        event_id: eventId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt ? endsAt.toISOString() : null,
    });

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(eventId, "Termin został dodany.");
}

export async function addPlaceOptionAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const name = String(formData.get("name") || "").trim();
    const address = String(formData.get("address") || "").trim();

    if (!eventId) redirect("/dashboard");

    if (!name) {
        redirectWithError(eventId, "Nazwa miejsca jest wymagana.");
    }

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Miejsca można dodawać tylko przed rozpoczęciem głosowania."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("place_options").insert({
        event_id: eventId,
        name,
        address,
    });

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(eventId, "Miejsce zostało dodane.");
}

export async function addParticipantAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const displayName = String(formData.get("displayName") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();

    if (!eventId) redirect("/dashboard");

    if (!displayName) {
        redirectWithError(eventId, "Imię uczestnika jest wymagane.");
    }

    if (!email) {
        redirectWithError(eventId, "E-mail uczestnika jest wymagany.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        redirectWithError(eventId, "Podaj poprawny adres e-mail.");
    }

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Uczestników można dodawać tylko przed rozpoczęciem głosowania."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingParticipant } = await supabase
        .from("participants")
        .select("id")
        .eq("event_id", eventId)
        .eq("email", email)
        .maybeSingle();

    if (existingParticipant) {
        redirectWithError(eventId, "Uczestnik z tym adresem e-mail już istnieje.");
    }

    const { error } = await supabase.from("participants").insert({
        event_id: eventId,
        display_name: displayName,
        email,
    });

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(
        eventId,
        "Uczestnik został dodany. E-mail zostanie wysłany po rozpoczęciu głosowania."
    );
}

export async function startVotingAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const votingDeadlineRaw = String(formData.get("votingDeadline") || "");

    if (!eventId) redirect("/dashboard");

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Głosowanie można rozpocząć tylko dla wydarzenia roboczego."
        );
    }

    if (!votingDeadlineRaw) {
        redirectWithError(eventId, "Ustaw termin zakończenia głosowania.");
    }

    const votingDeadline = new Date(votingDeadlineRaw);

    if (Number.isNaN(votingDeadline.getTime())) {
        redirectWithError(eventId, "Nieprawidłowy termin zakończenia głosowania.");
    }

    if (votingDeadline <= new Date()) {
        redirectWithError(
            eventId,
            "Termin zakończenia głosowania musi być w przyszłości."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: timeOptions, error: timeError } = await supabase
        .from("time_options")
        .select("id")
        .eq("event_id", eventId);

    if (timeError) redirectWithError(eventId, timeError.message);

    const { data: placeOptions, error: placeError } = await supabase
        .from("place_options")
        .select("id")
        .eq("event_id", eventId);

    if (placeError) redirectWithError(eventId, placeError.message);

    const { data: participants, error: participantsError } = await supabase
        .from("participants")
        .select("id, display_name, email")
        .eq("event_id", eventId);

    if (participantsError) redirectWithError(eventId, participantsError.message);

    if (!timeOptions || timeOptions.length === 0) {
        redirectWithError(
            eventId,
            "Dodaj przynajmniej jeden termin przed rozpoczęciem głosowania."
        );
    }

    if (!placeOptions || placeOptions.length === 0) {
        redirectWithError(
            eventId,
            "Dodaj przynajmniej jedno miejsce przed rozpoczęciem głosowania."
        );
    }

    if (!participants || participants.length === 0) {
        redirectWithError(
            eventId,
            "Dodaj przynajmniej jednego uczestnika przed rozpoczęciem głosowania."
        );
    }

    const { error: updateError } = await supabase
        .from("events")
        .update({
            status: "voting",
            voting_deadline: votingDeadline.toISOString(),
        })
        .eq("id", eventId)
        .eq("organizer_id", userId);

    if (updateError) redirectWithError(eventId, updateError.message);

    const voteUrl = `${getAppUrl()}/vote/${event.public_token}`;

    const emailResults = await Promise.allSettled(
        participants.map((participant) =>
            resend.emails.send({
                from: getFromEmail(),
                to: participant.email,
                subject: `Głosowanie rozpoczęte: ${event.title}`,
                html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Easy2Meet</h2>
            <p>Cześć ${participant.display_name || ""},</p>
            <p>Głosowanie nad wydarzeniem zostało rozpoczęte:</p>
            <p><strong>${event.title}</strong></p>
            <p>Termin zakończenia głosowania: <strong>${votingDeadline.toLocaleString("pl-PL")}</strong></p>
            <p>Kliknij poniższy link, aby zagłosować:</p>
            <p>
              <a href="${voteUrl}" style="display:inline-block;background:#1d4ed8;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;">
                Przejdź do głosowania
              </a>
            </p>
            <p>Jeśli przycisk nie działa, skopiuj ten link:</p>
            <p>${voteUrl}</p>
          </div>
        `,
            })
        )
    );

    const failedEmails = emailResults.filter(
        (result) => result.status === "rejected"
    ).length;

    revalidatePath(`/events/${eventId}`);

    if (failedEmails > 0) {
        redirectWithError(
            eventId,
            `Głosowanie zostało rozpoczęte, ale nie udało się wysłać ${failedEmails} wiadomości e-mail.`
        );
    }

    redirectWithSuccess(
        eventId,
        "Głosowanie zostało rozpoczęte, a zaproszenia wysłane e-mailem."
    );
}

export async function deleteTimeOptionAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const timeOptionId = String(formData.get("timeOptionId") || "");

    if (!eventId || !timeOptionId) redirect("/dashboard");

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Terminy można usuwać tylko przed rozpoczęciem głosowania."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
        .from("time_options")
        .delete()
        .eq("id", timeOptionId)
        .eq("event_id", eventId);

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(eventId, "Termin został usunięty.");
}

export async function deletePlaceOptionAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const placeOptionId = String(formData.get("placeOptionId") || "");

    if (!eventId || !placeOptionId) redirect("/dashboard");

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Miejsca można usuwać tylko przed rozpoczęciem głosowania."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
        .from("place_options")
        .delete()
        .eq("id", placeOptionId)
        .eq("event_id", eventId);

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(eventId, "Miejsce zostało usunięte.");
}

export async function deleteParticipantAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");
    const participantId = String(formData.get("participantId") || "");

    if (!eventId || !participantId) redirect("/dashboard");

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "draft") {
        redirectWithError(
            eventId,
            "Uczestników można usuwać tylko przed rozpoczęciem głosowania."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
        .from("participants")
        .delete()
        .eq("id", participantId)
        .eq("event_id", eventId);

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(eventId, "Uczestnik został usunięty.");
}

export async function closeVotingAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const eventId = String(formData.get("eventId") || "");

    if (!eventId) redirect("/dashboard");

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "voting") {
        redirectWithError(eventId, "Można zamknąć tylko aktywne głosowanie.");
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
        .from("events")
        .update({
            status: "closed",
        })
        .eq("id", eventId)
        .eq("organizer_id", userId);

    if (error) redirectWithError(eventId, error.message);

    revalidatePath(`/events/${eventId}`);
    redirectWithSuccess(eventId, "Głosowanie zostało zamknięte.");
}

export async function deleteEventAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const eventId = String(formData.get("eventId") || "");

    if (!eventId) {
        redirect("/dashboard");
    }

    await assertEventOwner(eventId, userId);

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
        .from("events")
        .delete()
        .eq("id", eventId)
        .eq("organizer_id", userId);

    if (error) {
        console.error("Delete event error:", error);
        redirectWithError(eventId, error.message);
    }

    revalidatePath("/dashboard");
    redirect("/dashboard");
}

type VoteValue = "yes" | "maybe" | "no";

type TimeOptionRow = {
    id: string;
    event_id: string;
    starts_at: string;
    ends_at: string | null;
};

type PlaceOptionRow = {
    id: string;
    event_id: string;
    name: string;
    address: string | null;
};

type VoteRow = {
    vote: VoteValue;
    time_option_id?: string;
    place_option_id?: string;
};

function countVotesForOption(optionId: string, votes: VoteRow[], key: "time_option_id" | "place_option_id") {
    const relatedVotes = votes.filter((vote) => vote[key] === optionId);

    const yes = relatedVotes.filter((vote) => vote.vote === "yes").length;
    const maybe = relatedVotes.filter((vote) => vote.vote === "maybe").length;
    const no = relatedVotes.filter((vote) => vote.vote === "no").length;

    return { yes, maybe, no };
}

function compareVoteScores(
    a: { yes: number; maybe: number; no: number },
    b: { yes: number; maybe: number; no: number }
) {
    if (a.yes !== b.yes) return b.yes - a.yes;
    if (a.maybe !== b.maybe) return b.maybe - a.maybe;
    return a.no - b.no;
}

function formatTimeOption(option: TimeOptionRow) {
    const start = new Date(option.starts_at).toLocaleString("pl-PL");

    if (!option.ends_at) {
        return start;
    }

    const end = new Date(option.ends_at).toLocaleString("pl-PL");
    return `${start} — ${end}`;
}

export async function finalizeAndSendResultsAction(formData: FormData) {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const eventId = String(formData.get("eventId") || "");

    if (!eventId) {
        redirect("/dashboard");
    }

    const event = await assertEventOwner(eventId, userId);

    if (event.status !== "closed") {
        redirectWithError(
            eventId,
            "Wyniki można zatwierdzić dopiero po zamknięciu głosowania."
        );
    }

    const supabase = createSupabaseAdminClient();

    const { data: timeOptions, error: timeOptionsError } = await supabase
        .from("time_options")
        .select("*")
        .eq("event_id", eventId);

    if (timeOptionsError) {
        redirectWithError(eventId, timeOptionsError.message);
    }

    const { data: placeOptions, error: placeOptionsError } = await supabase
        .from("place_options")
        .select("*")
        .eq("event_id", eventId);

    if (placeOptionsError) {
        redirectWithError(eventId, placeOptionsError.message);
    }

    const { data: timeVotes, error: timeVotesError } = await supabase
        .from("time_votes")
        .select("time_option_id, vote")
        .eq("event_id", eventId);

    if (timeVotesError) {
        redirectWithError(eventId, timeVotesError.message);
    }

    const { data: placeVotes, error: placeVotesError } = await supabase
        .from("place_votes")
        .select("place_option_id, vote")
        .eq("event_id", eventId);

    if (placeVotesError) {
        redirectWithError(eventId, placeVotesError.message);
    }

    const { data: participants, error: participantsError } = await supabase
        .from("participants")
        .select("display_name, email")
        .eq("event_id", eventId);

    if (participantsError) {
        redirectWithError(eventId, participantsError.message);
    }

    if (!timeOptions || timeOptions.length === 0) {
        redirectWithError(eventId, "Brak terminów do wybrania.");
    }

    if (!placeOptions || placeOptions.length === 0) {
        redirectWithError(eventId, "Brak miejsc do wybrania.");
    }

    if (!participants || participants.length === 0) {
        redirectWithError(eventId, "Brak uczestników do wysłania wyników.");
    }

    const rankedTimes = (timeOptions as TimeOptionRow[])
        .map((option) => ({
            option,
            score: countVotesForOption(
                option.id,
                (timeVotes ?? []) as VoteRow[],
                "time_option_id"
            ),
        }))
        .sort((a, b) => compareVoteScores(a.score, b.score));

    const rankedPlaces = (placeOptions as PlaceOptionRow[])
        .map((option) => ({
            option,
            score: countVotesForOption(
                option.id,
                (placeVotes ?? []) as VoteRow[],
                "place_option_id"
            ),
        }))
        .sort((a, b) => compareVoteScores(a.score, b.score));

    const bestTime = rankedTimes[0];
    const bestPlace = rankedPlaces[0];

    if (!bestTime || !bestPlace) {
        redirectWithError(eventId, "Nie udało się wyliczyć zwycięskich opcji.");
    }

    const { error: updateError } = await supabase
        .from("events")
        .update({
            status: "finalized",
            final_time_option_id: bestTime.option.id,
            final_place_option_id: bestPlace.option.id,
        })
        .eq("id", eventId)
        .eq("organizer_id", userId);

    if (updateError) {
        redirectWithError(eventId, updateError.message);
    }

    const finalTimeText = formatTimeOption(bestTime.option);
    const finalPlaceText = bestPlace.option.address
        ? `${bestPlace.option.name}, ${bestPlace.option.address}`
        : bestPlace.option.name;

    const emailResults = await Promise.allSettled(
        participants.map((participant) =>
            resend.emails.send({
                from: getFromEmail(),
                to: participant.email,
                subject: `Wyniki głosowania: ${event.title}`,
                html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>Easy2Meet</h2>

            <p>Cześć ${participant.display_name || ""},</p>

            <p>Głosowanie dla wydarzenia zostało zakończone:</p>
            <p><strong>${event.title}</strong></p>

            <h3>Finalny termin</h3>
            <p>${finalTimeText}</p>
            <p>Głosy: Tak ${bestTime.score.yes}, Może ${bestTime.score.maybe}, Nie ${bestTime.score.no}</p>

            <h3>Finalne miejsce</h3>
            <p>${finalPlaceText}</p>
            <p>Głosy: Tak ${bestPlace.score.yes}, Może ${bestPlace.score.maybe}, Nie ${bestPlace.score.no}</p>

            <p>Dziękujemy za udział w głosowaniu.</p>
          </div>
        `,
            })
        )
    );

    const failedEmails = emailResults.filter(
        (result) => result.status === "rejected"
    ).length;

    revalidatePath(`/events/${eventId}`);

    if (failedEmails > 0) {
        redirectWithError(
            eventId,
            `Wyniki zostały zatwierdzone, ale nie udało się wysłać ${failedEmails} wiadomości e-mail.`
        );
    }

    redirectWithSuccess(
        eventId,
        "Wyniki zostały zatwierdzone i wysłane uczestnikom e-mailem."
    );
}