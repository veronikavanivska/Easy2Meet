"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAppUrl, sendEmail } from "@/lib/email";

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

function buildAbsoluteVoteUrl(token: string, email?: string) {
    return `${getAppUrl()}${buildVoteUrl(token, { email })}`;
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
    title?: string;
    status: string;
    public_token?: string;
    voting_deadline: string | null;
};

type ParticipantRow = {
    id: string;
    display_name: string | null;
    email: string | null;
};

type EmailInput = {
    to: string;
    subject: string;
    html: string;
};

function isVotingExpired(event: {
    status: string;
    voting_deadline: string | null;
}) {
    if (event.status !== "voting") return false;
    if (!event.voting_deadline) return false;

    const deadline = new Date(event.voting_deadline);

    if (Number.isNaN(deadline.getTime())) return false;

    return deadline <= new Date();
}


function sendEmailsInBackground(emails: EmailInput[]) {
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
            console.error("Failed to send proposal notification emails:", failed);
        }
    });
}

function formatTimeRange(startsAt: Date, endsAt: Date | null) {
    const startText = startsAt.toLocaleString("pl-PL");

    if (!endsAt) return startText;

    return `${startText} — ${endsAt.toLocaleString("pl-PL")}`;
}

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
        .select("id, title, status, public_token, voting_deadline")
        .eq("public_token", token)
        .single();

    if (error || !event) return null;

    return await closeEventIfDeadlinePassed(event as EventRecord);
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

    return participant as ParticipantRow;
}

async function getOtherParticipants(eventId: string, currentParticipantId: string) {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
        .from("participants")
        .select("id, display_name, email")
        .eq("event_id", eventId)
        .neq("id", currentParticipantId);

    if (error || !data) return [];

    return data as ParticipantRow[];
}

function buildNewTimeEmail(input: {
    eventTitle: string;
    participantName: string | null;
    proposedTime: string;
    voteUrl: string;
}) {
    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
            <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                <h1 style="margin: 0 0 16px; color: #1d4ed8;">Easy2Meet</h1>

                <p>Cześć${input.participantName ? ` ${input.participantName}` : ""},</p>

                <p>W wydarzeniu pojawiła się nowa propozycja terminu:</p>

                <h2 style="margin: 16px 0; color: #0f172a;">${input.eventTitle}</h2>

                <div style="margin: 20px 0; padding: 16px; border-radius: 12px; background: #eff6ff;">
                    <p style="margin: 0; color: #1d4ed8; font-weight: bold;">Nowy termin</p>
                    <p style="margin: 8px 0 0; font-size: 16px;"><strong>${input.proposedTime}</strong></p>
                </div>

                <p>Wejdź w głosowanie i oceń nowy termin:</p>

                <p style="margin: 24px 0;">
                    <a href="${input.voteUrl}"
                       style="display: inline-block; background: #1d4ed8; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: bold;">
                        Przejdź do głosowania
                    </a>
                </p>

                <p style="font-size: 14px; color: #64748b;">Jeśli przycisk nie działa, skopiuj ten link:</p>
                <p style="font-size: 14px; word-break: break-all;">${input.voteUrl}</p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

                <p style="font-size: 12px; color: #64748b;">
                    Ta wiadomość została wysłana automatycznie przez Easy2Meet.
                </p>
            </div>
        </div>
    `;
}

function buildStaticMapUrl(latitude: number | null, longitude: number | null) {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    if (!accessToken) return null;
    if (latitude === null || longitude === null) return null;

    return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+1d4ed8(${longitude},${latitude})/${longitude},${latitude},14,0/600x260@2x?access_token=${accessToken}`;
}

function buildNewPlaceEmail(input: {
    eventTitle: string;
    participantName: string | null;
    placeName: string;
    placeAddress: string | null;
    mapImageUrl: string | null;
    voteUrl: string;
}) {
    return `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
            <div style="max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff;">
                <h1 style="margin: 0 0 16px; color: #1d4ed8;">Easy2Meet</h1>

                <p>Cześć${input.participantName ? ` ${input.participantName}` : ""},</p>

                <p>W wydarzeniu pojawiła się nowa propozycja miejsca:</p>

                <h2 style="margin: 16px 0; color: #0f172a;">${input.eventTitle}</h2>

                <div style="margin: 20px 0; padding: 16px; border-radius: 12px; background: #eff6ff;">
                    <p style="margin: 0; color: #1d4ed8; font-weight: bold;">Nowe miejsce</p>
                    <p style="margin: 8px 0 0; font-size: 16px;"><strong>${input.placeName}</strong></p>
                    ${
                        input.placeAddress
                            ? `<p style="margin: 6px 0 0; color: #475569;">${input.placeAddress}</p>`
                            : ""
                    }
                </div>

                ${
                    input.mapImageUrl
                        ? `<img src="${input.mapImageUrl}" alt="Mapa miejsca" style="display: block; width: 100%; max-width: 600px; border-radius: 14px; border: 1px solid #e2e8f0; margin: 18px 0;" />`
                        : ""
                }

                <p>Wejdź w głosowanie i oceń nowe miejsce:</p>

                <p style="margin: 24px 0;">
                    <a href="${input.voteUrl}"
                       style="display: inline-block; background: #1d4ed8; color: #ffffff; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: bold;">
                        Przejdź do głosowania
                    </a>
                </p>

                <p style="font-size: 14px; color: #64748b;">Jeśli przycisk nie działa, skopiuj ten link:</p>
                <p style="font-size: 14px; word-break: break-all;">${input.voteUrl}</p>

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

                <p style="font-size: 12px; color: #64748b;">
                    Ta wiadomość została wysłana automatycznie przez Easy2Meet.
                </p>
            </div>
        </div>
    `;
}

async function closeEventIfEveryoneVoted(eventId: string) {
    const supabase = createSupabaseAdminClient();

    const { data: event } = await supabase
        .from("events")
        .select("id, status")
        .eq("id", eventId)
        .single();

    if (!event || event.status !== "voting" || isVotingExpired(event)) {
        return;
    }

    const [participantsResult, timeOptionsResult, placeOptionsResult, timeVotesResult, placeVotesResult] =
        await Promise.all([
            supabase.from("participants").select("id").eq("event_id", eventId),
            supabase.from("time_options").select("id").eq("event_id", eventId),
            supabase.from("place_options").select("id").eq("event_id", eventId),
            supabase
                .from("time_votes")
                .select("participant_id, time_option_id")
                .eq("event_id", eventId),
            supabase
                .from("place_votes")
                .select("participant_id, place_option_id")
                .eq("event_id", eventId),
        ]);

    const participants = participantsResult.data ?? [];
    const timeOptions = timeOptionsResult.data ?? [];
    const placeOptions = placeOptionsResult.data ?? [];
    const timeVotes = timeVotesResult.data ?? [];
    const placeVotes = placeVotesResult.data ?? [];

    if (participants.length === 0 || timeOptions.length === 0 || placeOptions.length === 0) {
        return;
    }

    const everyoneVotedForEveryOption = participants.every((participant) => {
        const votedTimeOptionIds = new Set(
            timeVotes
                .filter((vote) => vote.participant_id === participant.id)
                .map((vote) => vote.time_option_id)
        );

        const votedPlaceOptionIds = new Set(
            placeVotes
                .filter((vote) => vote.participant_id === participant.id)
                .map((vote) => vote.place_option_id)
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

    if (event.status !== "voting" || isVotingExpired(event)) {
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

    const { error } = await supabase.from("time_options").insert({
        event_id: event.id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt ? endsAt.toISOString() : null,
    });

    if (error) redirectWithError(token, error.message, participantEmail);

    const otherParticipants = await getOtherParticipants(event.id, participant.id);
    const proposedTime = formatTimeRange(startsAt, endsAt);

    sendEmailsInBackground(
        otherParticipants
            .filter((otherParticipant) => otherParticipant.email)
            .map((otherParticipant) => ({
                to: otherParticipant.email as string,
                subject: `Easy2Meet: nowy termin do głosowania — ${event.title ?? "wydarzenie"}`,
                html: buildNewTimeEmail({
                    eventTitle: event.title ?? "Wydarzenie",
                    participantName: otherParticipant.display_name,
                    proposedTime,
                    voteUrl: buildAbsoluteVoteUrl(token, otherParticipant.email ?? undefined),
                }),
            }))
    );

    revalidatePath(`/vote/${token}`);
    redirectWithSuccess(
        token,
        "Twoja propozycja terminu została dodana. Uczestnicy otrzymają powiadomienie e-mail.",
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
    const latitudeRaw = String(formData.get("latitude") || "").trim();
    const longitudeRaw = String(formData.get("longitude") || "").trim();
    const mapboxId = String(formData.get("mapboxId") || "").trim();

    const latitude = latitudeRaw ? Number(latitudeRaw) : null;
    const longitude = longitudeRaw ? Number(longitudeRaw) : null;

    if (!token) redirect("/");

    if (!participantEmail) {
        redirectWithError(token, "Najpierw potwierdź swój e-mail.");
    }

    if (!name) {
        redirectWithError(token, "Nazwa miejsca jest wymagana.", participantEmail);
    }

    if (
        latitudeRaw &&
        (latitude === null ||
            Number.isNaN(latitude) ||
            latitude < -90 ||
            latitude > 90)
    ) {
        redirectWithError(token, "Nieprawidłowa szerokość geograficzna.", participantEmail);
    }

    if (
        longitudeRaw &&
        (longitude === null ||
            Number.isNaN(longitude) ||
            longitude < -180 ||
            longitude > 180)
    ) {
        redirectWithError(token, "Nieprawidłowa długość geograficzna.", participantEmail);
    }

    const event = await getEventByToken(token);

    if (!event) {
        redirectWithError(token, "Nie znaleziono wydarzenia.", participantEmail);
    }

    if (event.status !== "voting" || isVotingExpired(event)) {
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
        address: address || null,
        latitude,
        longitude,
        mapbox_id: mapboxId || null,
    });

    if (error) redirectWithError(token, error.message, participantEmail);

    const otherParticipants = await getOtherParticipants(event.id, participant.id);
    const mapImageUrl = buildStaticMapUrl(latitude, longitude);

    sendEmailsInBackground(
        otherParticipants
            .filter((otherParticipant) => otherParticipant.email)
            .map((otherParticipant) => ({
                to: otherParticipant.email as string,
                subject: `Easy2Meet: nowe miejsce do głosowania — ${event.title ?? "wydarzenie"}`,
                html: buildNewPlaceEmail({
                    eventTitle: event.title ?? "Wydarzenie",
                    participantName: otherParticipant.display_name,
                    placeName: name,
                    placeAddress: address || null,
                    mapImageUrl,
                    voteUrl: buildAbsoluteVoteUrl(token, otherParticipant.email ?? undefined),
                }),
            }))
    );

    revalidatePath(`/vote/${token}`);
    redirectWithSuccess(
        token,
        "Twoja propozycja miejsca została dodana. Uczestnicy otrzymają powiadomienie e-mail.",
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

    if (event.status !== "voting" || isVotingExpired(event)) {
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

    if (event.status !== "voting" || isVotingExpired(event)) {
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
