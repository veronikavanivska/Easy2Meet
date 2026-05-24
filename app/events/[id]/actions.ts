"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, sendEmail } from "@/lib/email";

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

function sendEmailsInBackground(
    emails: Array<{
        to: string;
        subject: string;
        html: string;
    }>
) {
    if (emails.length === 0) return;

    void Promise.allSettled(
        emails.map((email) =>
            sendEmail({
                to: email.to,
                subject: email.subject,
                html: email.html,
            })
        )
    ).then((results) => {
        const failed = results.filter((result) => result.status === "rejected");

        if (failed.length > 0) {
            console.error("Failed to send some emails:", failed);
        }
    });
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
    const latitudeRaw = String(formData.get("latitude") || "").trim();
    const longitudeRaw = String(formData.get("longitude") || "").trim();
    const mapboxId = String(formData.get("mapboxId") || "").trim();

    const latitude = latitudeRaw ? Number(latitudeRaw) : null;
    const longitude = longitudeRaw ? Number(longitudeRaw) : null;

    if (!eventId) redirect("/dashboard");

    if (!name) {
        redirectWithError(eventId, "Nazwa miejsca jest wymagana.");
    }

    if (
        latitudeRaw &&
        (latitude === null ||
            Number.isNaN(latitude) ||
            latitude < -90 ||
            latitude > 90)
    ) {
        redirectWithError(eventId, "Nieprawidłowa szerokość geograficzna.");
    }

    if (
        longitudeRaw &&
        (longitude === null ||
            Number.isNaN(longitude) ||
            longitude < -180 ||
            longitude > 180)
    ) {
        redirectWithError(eventId, "Nieprawidłowa długość geograficzna.");
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
        address: address || null,
        latitude,
        longitude,
        mapbox_id: mapboxId || null,
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

    const { error } = await supabase.from("participants").insert({
        event_id: eventId,
        display_name: displayName,
        email,
    });

    if (error) {
        if (error.code === "23505") {
            redirectWithError(
                eventId,
                "Uczestnik z tym adresem e-mail już istnieje."
            );
        }

        redirectWithError(eventId, error.message);
    }

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

    const [timeOptionsResult, placeOptionsResult, participantsResult] =
        await Promise.all([
            supabase.from("time_options").select("id").eq("event_id", eventId),
            supabase.from("place_options").select("id").eq("event_id", eventId),
            supabase
                .from("participants")
                .select("id, display_name, email")
                .eq("event_id", eventId),
        ]);

    if (timeOptionsResult.error) {
        redirectWithError(eventId, timeOptionsResult.error.message);
    }

    if (placeOptionsResult.error) {
        redirectWithError(eventId, placeOptionsResult.error.message);
    }

    if (participantsResult.error) {
        redirectWithError(eventId, participantsResult.error.message);
    }

    const timeOptions = timeOptionsResult.data ?? [];
    const placeOptions = placeOptionsResult.data ?? [];
    const participants = participantsResult.data ?? [];

    if (timeOptions.length === 0) {
        redirectWithError(
            eventId,
            "Dodaj przynajmniej jeden termin przed rozpoczęciem głosowania."
        );
    }

    if (placeOptions.length === 0) {
        redirectWithError(
            eventId,
            "Dodaj przynajmniej jedno miejsce przed rozpoczęciem głosowania."
        );
    }

    if (participants.length === 0) {
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

    const emails = participants
        .filter((participant) => participant.email)
        .map((participant) => ({
            to: participant.email as string,
            subject: `Easy2Meet: głosowanie rozpoczęte — ${event.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                        <h1 style="margin: 0 0 16px; color: #1d4ed8;">Easy2Meet</h1>

                        <p>Cześć ${participant.display_name || ""},</p>

                        <p>Głosowanie nad wydarzeniem zostało rozpoczęte:</p>

                        <h2 style="margin: 16px 0; color: #0f172a;">${event.title}</h2>

                        <p>
                            Termin zakończenia głosowania:
                            <strong>${votingDeadline.toLocaleString("pl-PL")}</strong>
                        </p>

                        <p>Kliknij poniższy przycisk, aby wybrać pasujący termin i miejsce:</p>

                        <p style="margin: 24px 0;">
                            <a href="${voteUrl}"
                               style="display: inline-block; background: #1d4ed8; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: bold;">
                                Przejdź do głosowania
                            </a>
                        </p>

                        <p style="font-size: 14px; color: #64748b;">
                            Jeśli przycisk nie działa, skopiuj ten link:
                        </p>

                        <p style="font-size: 14px; word-break: break-all;">
                            ${voteUrl}
                        </p>

                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

                        <p style="font-size: 12px; color: #64748b;">
                            Ta wiadomość została wysłana automatycznie przez Easy2Meet.
                        </p>
                    </div>
                </div>
            `,
        }));

    sendEmailsInBackground(emails);

    revalidatePath(`/events/${eventId}`);

    redirectWithSuccess(
        eventId,
        "Głosowanie zostało rozpoczęte. Zaproszenia są wysyłane e-mailem."
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

function countVotesForOption(
    optionId: string,
    votes: VoteRow[],
    key: "time_option_id" | "place_option_id"
) {
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

    const [
        timeOptionsResult,
        placeOptionsResult,
        timeVotesResult,
        placeVotesResult,
        participantsResult,
    ] = await Promise.all([
        supabase.from("time_options").select("*").eq("event_id", eventId),
        supabase.from("place_options").select("*").eq("event_id", eventId),
        supabase
            .from("time_votes")
            .select("time_option_id, vote")
            .eq("event_id", eventId),
        supabase
            .from("place_votes")
            .select("place_option_id, vote")
            .eq("event_id", eventId),
        supabase
            .from("participants")
            .select("display_name, email")
            .eq("event_id", eventId),
    ]);

    if (timeOptionsResult.error) {
        redirectWithError(eventId, timeOptionsResult.error.message);
    }

    if (placeOptionsResult.error) {
        redirectWithError(eventId, placeOptionsResult.error.message);
    }

    if (timeVotesResult.error) {
        redirectWithError(eventId, timeVotesResult.error.message);
    }

    if (placeVotesResult.error) {
        redirectWithError(eventId, placeVotesResult.error.message);
    }

    if (participantsResult.error) {
        redirectWithError(eventId, participantsResult.error.message);
    }

    const timeOptions = timeOptionsResult.data ?? [];
    const placeOptions = placeOptionsResult.data ?? [];
    const timeVotes = timeVotesResult.data ?? [];
    const placeVotes = placeVotesResult.data ?? [];
    const participants = participantsResult.data ?? [];

    if (timeOptions.length === 0) {
        redirectWithError(eventId, "Brak terminów do wybrania.");
    }

    if (placeOptions.length === 0) {
        redirectWithError(eventId, "Brak miejsc do wybrania.");
    }

    if (participants.length === 0) {
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

    const emails = participants
        .filter((participant) => participant.email)
        .map((participant) => ({
            to: participant.email as string,
            subject: `Easy2Meet: wyniki głosowania — ${event.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                        <h1 style="margin: 0 0 16px; color: #1d4ed8;">Easy2Meet</h1>

                        <p>Cześć ${participant.display_name || ""},</p>

                        <p>Głosowanie dla wydarzenia zostało zakończone:</p>

                        <h2 style="margin: 16px 0; color: #0f172a;">${event.title}</h2>

                        <div style="margin: 24px 0; padding: 16px; border-radius: 12px; background: #eff6ff;">
                            <h3 style="margin: 0 0 8px; color: #1d4ed8;">Najlepszy termin</h3>
                            <p style="margin: 0; font-size: 16px;">
                                <strong>${finalTimeText}</strong>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 14px; color: #475569;">
                                Głosy: Tak ${bestTime.score.yes}, Może ${bestTime.score.maybe}, Nie ${bestTime.score.no}
                            </p>
                        </div>

                        <div style="margin: 24px 0; padding: 16px; border-radius: 12px; background: #f8fafc;">
                            <h3 style="margin: 0 0 8px; color: #1d4ed8;">Najlepsze miejsce</h3>
                            <p style="margin: 0; font-size: 16px;">
                                <strong>${finalPlaceText}</strong>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 14px; color: #475569;">
                                Głosy: Tak ${bestPlace.score.yes}, Może ${bestPlace.score.maybe}, Nie ${bestPlace.score.no}
                            </p>
                        </div>

                        <p>Dziękujemy za udział w głosowaniu.</p>

                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

                        <p style="font-size: 12px; color: #64748b;">
                            Ta wiadomość została wysłana automatycznie przez Easy2Meet.
                        </p>
                    </div>
                </div>
            `,
        }));

    sendEmailsInBackground(emails);

    revalidatePath(`/events/${eventId}`);

    redirectWithSuccess(
        eventId,
        "Wyniki zostały zatwierdzone. Wiadomości e-mail są wysyłane uczestnikom."
    );
}