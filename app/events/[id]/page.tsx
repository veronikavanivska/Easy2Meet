import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StatusMessage } from "../../components/StatusMessage";
import {
    addParticipantAction,
    addPlaceOptionAction,
    addTimeOptionAction,
    closeVotingAction,
    deleteEventAction,
    deleteParticipantAction,
    deletePlaceOptionAction,
    deleteTimeOptionAction,
    finalizeAndSendResultsAction,
    startVotingAction,
} from "./actions";
import { EventPlacesMap } from "../../components/event-places-map";
import { MapboxPlacePicker } from "../../components/mapbox-place-picker";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        error?: string;
        success?: string;
    }>;
};

type EventRecord = {
    id: string;
    title: string;
    description: string | null;
    organizer_id: string;
    public_token: string;
    status: string;
    voting_deadline: string | null;
    final_time_option_id?: string | null;
    final_place_option_id?: string | null;
};

type TimeOption = {
    id: string;
    event_id: string;
    starts_at: string;
    ends_at: string | null;
};

type PlaceOption = {
    id: string;
    event_id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    mapbox_id?: string | null;
};

type Participant = {
    id: string;
    event_id: string;
    display_name: string | null;
    email: string | null;
};

type VoteValue = "yes" | "maybe" | "no";

type TimeVote = {
    id?: string;
    event_id: string;
    time_option_id: string;
    participant_id: string;
    vote: VoteValue;
};

type PlaceVote = {
    id?: string;
    event_id: string;
    place_option_id: string;
    participant_id: string;
    vote: VoteValue;
};

type ResultCounts = {
    yes: number;
    maybe: number;
    no: number;
};

function statusLabel(status: string) {
    if (status === "draft") return "Robocze";
    if (status === "voting") return "Głosowanie aktywne";
    if (status === "closed") return "Głosowanie zamknięte";
    if (status === "finalized") return "Zatwierdzone";

    return status;
}

function statusBadgeClass(status: string) {
    if (status === "draft") return "bg-slate-100 text-slate-700 border-slate-200";
    if (status === "voting")
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (status === "closed") return "bg-red-100 text-red-700 border-red-200";
    if (status === "finalized")
        return "bg-blue-100 text-blue-700 border-blue-200";

    return "bg-slate-100 text-slate-700 border-slate-200";
}

function countTimeVotes(optionId: string, votes: TimeVote[]): ResultCounts {
    const relatedVotes = votes.filter((vote) => vote.time_option_id === optionId);

    return {
        yes: relatedVotes.filter((vote) => vote.vote === "yes").length,
        maybe: relatedVotes.filter((vote) => vote.vote === "maybe").length,
        no: relatedVotes.filter((vote) => vote.vote === "no").length,
    };
}

function countPlaceVotes(optionId: string, votes: PlaceVote[]): ResultCounts {
    const relatedVotes = votes.filter((vote) => vote.place_option_id === optionId);

    return {
        yes: relatedVotes.filter((vote) => vote.vote === "yes").length,
        maybe: relatedVotes.filter((vote) => vote.vote === "maybe").length,
        no: relatedVotes.filter((vote) => vote.vote === "no").length,
    };
}

function resultScoreClass(counts: ResultCounts) {
    if (counts.yes === 0 && counts.maybe === 0 && counts.no === 0) {
        return "border-slate-200 bg-slate-50 text-slate-600";
    }

    if (counts.yes >= counts.no) {
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    return "border-red-200 bg-red-50 text-red-700";
}

function compareResults(a: ResultCounts, b: ResultCounts) {
    if (a.yes !== b.yes) return b.yes - a.yes;
    if (a.maybe !== b.maybe) return b.maybe - a.maybe;
    return a.no - b.no;
}


function getEffectiveEventStatus(event: EventRecord) {
    if (event.status !== "voting") return event.status;
    if (!event.voting_deadline) return event.status;

    const deadline = new Date(event.voting_deadline);

    if (Number.isNaN(deadline.getTime())) return event.status;

    return deadline <= new Date() ? "closed" : event.status;
}

function formatTimeOption(option: TimeOption) {
    const start = new Date(option.starts_at).toLocaleString("pl-PL");

    if (!option.ends_at) {
        return start;
    }

    const end = new Date(option.ends_at).toLocaleString("pl-PL");
    return `${start} — ${end}`;
}

export default async function EventDetailsPage({
                                                   params,
                                                   searchParams,
                                               }: PageProps) {
    const { id } = await params;
    const { error: errorMessage, success: successMessage } = await searchParams;

    const { userId } = await auth();

    if (!userId) redirect("/sign-in");

    const supabase = createSupabaseAdminClient();

    const [
        eventResult,
        timeOptionsResult,
        placeOptionsResult,
        participantsResult,
        timeVotesResult,
        placeVotesResult,
    ] = await Promise.all([
        supabase
            .from("events")
            .select("*")
            .eq("id", id)
            .eq("organizer_id", userId)
            .single(),

        supabase
            .from("time_options")
            .select("*")
            .eq("event_id", id)
            .order("starts_at", { ascending: true }),

        supabase
            .from("place_options")
            .select("*")
            .eq("event_id", id)
            .order("created_at", { ascending: true }),

        supabase
            .from("participants")
            .select("*")
            .eq("event_id", id)
            .order("created_at", { ascending: true }),

        supabase
            .from("time_votes")
            .select("*")
            .eq("event_id", id),

        supabase
            .from("place_votes")
            .select("*")
            .eq("event_id", id),
    ]);

    const eventData = eventResult.data;
    const error = eventResult.error;

    if (error || !eventData) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="rounded-3xl border bg-white p-8 shadow-sm">
                    <h1 className="text-xl font-bold text-slate-900">
                        Nie znaleziono wydarzenia
                    </h1>

                    <p className="mt-2 text-sm text-slate-600">
                        Sprawdź, czy wydarzenie istnieje i czy jesteś jego organizatorem.
                    </p>

                    <Link
                        href="/dashboard"
                        className="mt-4 inline-flex rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white"
                    >
                        Wróć do dashboardu
                    </Link>
                </div>
            </main>
        );
    }

    if (timeOptionsResult.error) {
        throw new Error(timeOptionsResult.error.message);
    }

    if (placeOptionsResult.error) {
        throw new Error(placeOptionsResult.error.message);
    }

    if (participantsResult.error) {
        throw new Error(participantsResult.error.message);
    }

    if (timeVotesResult.error) {
        throw new Error(timeVotesResult.error.message);
    }

    if (placeVotesResult.error) {
        throw new Error(placeVotesResult.error.message);
    }

    const eventRaw = eventData as EventRecord;
    const event = {
        ...eventRaw,
        status: getEffectiveEventStatus(eventRaw),
    };
    const timeOptions = (timeOptionsResult.data ?? []) as TimeOption[];
    const placeOptions = (placeOptionsResult.data ?? []) as PlaceOption[];
    const participants = (participantsResult.data ?? []) as Participant[];
    const allTimeVotes = (timeVotesResult.data ?? []) as TimeVote[];
    const allPlaceVotes = (placeVotesResult.data ?? []) as PlaceVote[];

    const rankedTimeOptions = timeOptions
        .map((option) => ({
            option,
            counts: countTimeVotes(option.id, allTimeVotes),
        }))
        .sort((a, b) => compareResults(a.counts, b.counts));

    const rankedPlaceOptions = placeOptions
        .map((option) => ({
            option,
            counts: countPlaceVotes(option.id, allPlaceVotes),
        }))
        .sort((a, b) => compareResults(a.counts, b.counts));

    const bestTimeOption = rankedTimeOptions[0];
    const bestPlaceOption = rankedPlaceOptions[0];

    const showResults = event.status === "closed" || event.status === "finalized";

    const voteLink = `/vote/${event.public_token}`;
    const fullVoteLink = `http://localhost:3000${voteLink}`;

    const canEditSetup = event.status === "draft";
    const canStartVoting =
        event.status === "draft" &&
        timeOptions.length > 0 &&
        placeOptions.length > 0 &&
        participants.length > 0;

    const completedParticipants = participants.filter((participant) => {
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
    }).length;

    return (
        <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#bfdbfe,_#dbeafe_35%,_#e0e7ff_70%,_#f8fafc_100%)]">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-[-100px] top-[-80px] h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
                <div className="absolute right-[-120px] top-[140px] h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="absolute bottom-[-140px] left-[25%] h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
            </div>

            <section className="relative mx-auto max-w-6xl px-6 py-10">
                <Link
                    href="/dashboard"
                    className="text-sm font-semibold text-blue-800 hover:text-blue-900"
                >
                    ← Wróć do dashboardu
                </Link>

                <StatusMessage
                    error={errorMessage}
                    success={successMessage}
                    durationMs={4000}
                />

                <div className="mt-6 rounded-3xl border border-white/40 bg-white/35 p-8 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.12)]">
                    <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
                        <div>
                            <div
                                className={`mb-3 inline-flex rounded-2xl border px-3 py-1 text-sm font-medium ${statusBadgeClass(
                                    event.status
                                )}`}
                            >
                                Status: {statusLabel(event.status)}
                            </div>

                            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
                                {event.title}
                            </h1>

                            <p className="mt-4 max-w-2xl text-slate-700">
                                {event.description || "Brak opisu wydarzenia."}
                            </p>

                            {event.voting_deadline && (
                                <p className="mt-4 text-sm font-medium text-slate-700">
                                    Termin zakończenia głosowania:{" "}
                                    {new Date(event.voting_deadline).toLocaleString("pl-PL")}
                                </p>
                            )}

                            {event.status !== "draft" && (
                                <p className="mt-2 text-sm text-slate-600">
                                    Zagłosowało: {completedParticipants}/{participants.length}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3">
                            {event.status === "draft" && (
                                <form action={startVotingAction} className="space-y-3">
                                    <input type="hidden" name="eventId" value={event.id} />

                                    <div>
                                        <label className="mb-2 block text-sm font-semibold text-slate-800">
                                            Termin zakończenia głosowania
                                        </label>

                                        <input
                                            name="votingDeadline"
                                            type="datetime-local"
                                            required
                                            disabled={!canStartVoting}
                                            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                        />
                                    </div>

                                    <button
                                        disabled={!canStartVoting}
                                        className="w-full rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.35)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Rozpocznij głosowanie
                                    </button>
                                </form>
                            )}

                            {event.status === "voting" && (
                                <form action={closeVotingAction}>
                                    <input type="hidden" name="eventId" value={event.id} />

                                    <button className="w-full rounded-2xl border border-red-500/30 bg-red-500 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(239,68,68,0.25)] transition hover:bg-red-600">
                                        Zamknij głosowanie
                                    </button>
                                </form>
                            )}

                            <form action={deleteEventAction}>
                                <input type="hidden" name="eventId" value={event.id} />

                                <button className="w-full rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-700 transition hover:bg-red-100">
                                    Usuń wydarzenie
                                </button>
                            </form>
                        </div>
                    </div>

                    {event.status === "draft" && (
                        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-800 backdrop-blur-xl">
                            <p className="font-semibold">Wydarzenie jest w trybie roboczym.</p>
                            <p className="mt-1">
                                Dodaj przynajmniej jeden termin, jedno miejsce i jednego
                                uczestnika, a potem kliknij „Rozpocznij głosowanie”. Linki
                                e-mail zostaną wysłane dopiero wtedy.
                            </p>

                            {!canStartVoting && (
                                <ul className="mt-3 list-inside list-disc">
                                    {timeOptions.length === 0 && <li>Brakuje terminu.</li>}
                                    {placeOptions.length === 0 && <li>Brakuje miejsca.</li>}
                                    {participants.length === 0 && <li>Brakuje uczestnika.</li>}
                                </ul>
                            )}
                        </div>
                    )}

                    {event.status === "voting" && (
                        <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 text-sm text-emerald-800 backdrop-blur-xl">
                            <p className="font-semibold">Głosowanie jest aktywne.</p>
                            <p className="mt-1">
                                Uczestnicy mogą głosować oraz proponować własne terminy i
                                miejsca.
                            </p>
                        </div>
                    )}

                    {event.status === "closed" && (
                        <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/80 p-5 text-sm text-red-800 backdrop-blur-xl">
                            <p className="font-semibold">Głosowanie zostało zamknięte.</p>
                            <p className="mt-1">
                                Uczestnicy nie mogą już oddawać ani zmieniać głosów.
                            </p>
                        </div>
                    )}

                    {event.status === "finalized" && (
                        <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50/80 p-5 text-sm text-blue-800 backdrop-blur-xl">
                            <p className="font-semibold">Wyniki zostały zatwierdzone.</p>
                            <p className="mt-1">
                                Finalny termin i miejsce zostały wysłane uczestnikom e-mailem.
                            </p>
                        </div>
                    )}

                </div>

                {showResults && (
                    <div className="mt-8 rounded-3xl border border-white/40 bg-white/35 p-8 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.12)]">
                        <div className="mb-6">
                            <div className="mb-3 inline-flex rounded-2xl bg-blue-700/10 px-3 py-1 text-sm font-medium text-blue-800">
                                Wyniki głosowania
                            </div>

                            <h2 className="text-2xl font-bold text-slate-900">
                                Najlepsze propozycje
                            </h2>

                            <p className="mt-2 text-sm text-slate-700">
                                Zwycięzca jest wybierany według liczby głosów „Tak”, potem
                                „Może”, a na końcu według mniejszej liczby głosów „Nie”.
                            </p>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
                                <h3 className="font-semibold text-emerald-800">
                                    Najlepszy termin
                                </h3>

                                {bestTimeOption ? (
                                    <>
                                        <p className="mt-3 font-bold text-slate-900">
                                            {formatTimeOption(bestTimeOption.option)}
                                        </p>

                                        <p className="mt-3 text-sm text-emerald-800">
                                            Tak: {bestTimeOption.counts.yes} | Może:{" "}
                                            {bestTimeOption.counts.maybe} | Nie:{" "}
                                            {bestTimeOption.counts.no}
                                        </p>
                                    </>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-600">Brak terminów.</p>
                                )}
                            </div>

                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
                                <h3 className="font-semibold text-emerald-800">
                                    Najlepsze miejsce
                                </h3>

                                {bestPlaceOption ? (
                                    <>
                                        <p className="mt-3 font-bold text-slate-900">
                                            {bestPlaceOption.option.name}
                                        </p>

                                        {bestPlaceOption.option.address && (
                                            <p className="mt-1 text-sm text-slate-700">
                                                {bestPlaceOption.option.address}
                                            </p>
                                        )}

                                        <p className="mt-3 text-sm text-emerald-800">
                                            Tak: {bestPlaceOption.counts.yes} | Może:{" "}
                                            {bestPlaceOption.counts.maybe} | Nie:{" "}
                                            {bestPlaceOption.counts.no}
                                        </p>
                                    </>
                                ) : (
                                    <p className="mt-3 text-sm text-slate-600">Brak miejsc.</p>
                                )}
                            </div>
                        </div>

                        {event.status === "closed" && (
                            <form action={finalizeAndSendResultsAction} className="mt-6">
                                <input type="hidden" name="eventId" value={event.id} />

                                <button className="rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.35)] transition hover:bg-blue-800">
                                    Zatwierdź i wyślij wyniki uczestnikom
                                </button>
                            </form>
                        )}

                        {event.status === "finalized" && (
                            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/80 p-4 text-sm font-medium text-blue-700">
                                Wyniki zostały już zatwierdzone i wysłane uczestnikom.
                            </div>
                        )}
                    </div>
                )}
                <div className="mt-8">
                    <div className="mb-4">
                        <div className="mb-2 inline-flex rounded-2xl bg-indigo-700/10 px-3 py-1 text-sm font-medium text-indigo-800">
                            Mapa miejsc
                        </div>

                        <h2 className="text-2xl font-bold text-slate-900">
                            Lokalizacje propozycji
                        </h2>

                        <p className="mt-2 text-sm text-slate-700">
                            Na mapie pojawią się miejsca, które mają zapisane współrzędne z Mapboxa.
                        </p>
                    </div>

                    <EventPlacesMap places={placeOptions} />
                </div>
                <div className="mt-8 grid gap-6 lg:grid-cols-3">
                    <section className="rounded-3xl border border-white/40 bg-white/35 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                        <div className="mb-5">
                            <div className="mb-2 inline-flex rounded-2xl bg-blue-700/10 px-3 py-1 text-sm font-medium text-blue-800">
                                Terminy
                            </div>

                            <h2 className="text-xl font-bold text-slate-900">
                                Propozycje terminów
                            </h2>

                            <p className="mt-2 text-sm text-slate-700">
                                Dodaj możliwe daty i godziny spotkania.
                            </p>
                        </div>

                        <form action={addTimeOptionAction} className="space-y-4">
                            <input type="hidden" name="eventId" value={event.id} />

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">
                                    Początek
                                </label>

                                <input
                                    name="startsAt"
                                    type="datetime-local"
                                    required
                                    disabled={!canEditSetup}
                                    className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">
                                    Koniec opcjonalnie — musi być później niż początek
                                </label>

                                <input
                                    name="endsAt"
                                    type="datetime-local"
                                    disabled={!canEditSetup}
                                    className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                />
                            </div>

                            <button
                                disabled={!canEditSetup}
                                className="w-full rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.30)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Dodaj termin
                            </button>
                        </form>

                        <div className="mt-6 space-y-3">
                            {timeOptions.length === 0 ? (
                                <p className="rounded-2xl border border-white/50 bg-white/40 p-4 text-sm text-slate-600">
                                    Nie dodano jeszcze żadnego terminu.
                                </p>
                            ) : (
                                timeOptions.map((option) => {
                                    const counts = countTimeVotes(option.id, allTimeVotes);

                                    return (
                                        <div
                                            key={option.id}
                                            className="rounded-2xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl"
                                        >
                                            <p className="font-semibold text-slate-900">
                                                {new Date(option.starts_at).toLocaleString("pl-PL")}
                                            </p>

                                            {option.ends_at && (
                                                <p className="mt-1 text-sm text-slate-600">
                                                    Do:{" "}
                                                    {new Date(option.ends_at).toLocaleString("pl-PL")}
                                                </p>
                                            )}

                                            {showResults && (
                                                <div
                                                    className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${resultScoreClass(
                                                        counts
                                                    )}`}
                                                >
                                                    Tak: {counts.yes} | Może: {counts.maybe} | Nie:{" "}
                                                    {counts.no}
                                                </div>
                                            )}

                                            <form action={deleteTimeOptionAction} className="mt-3">
                                                <input type="hidden" name="eventId" value={event.id} />
                                                <input
                                                    type="hidden"
                                                    name="timeOptionId"
                                                    value={option.id}
                                                />

                                                <button
                                                    disabled={!canEditSetup}
                                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Usuń termin
                                                </button>
                                            </form>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-white/40 bg-white/35 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                        <div className="mb-5">
                            <div className="mb-2 inline-flex rounded-2xl bg-indigo-700/10 px-3 py-1 text-sm font-medium text-indigo-800">
                                Miejsca
                            </div>

                            <h2 className="text-xl font-bold text-slate-900">
                                Propozycje miejsc
                            </h2>

                            <p className="mt-2 text-sm text-slate-700">
                                Dodaj lokalizacje, na które uczestnicy będą głosować.
                            </p>
                        </div>

                        <form action={addPlaceOptionAction} className="space-y-4">
                            <input type="hidden" name="eventId" value={event.id} />

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">
                                    Nazwa miejsca
                                </label>

                                <input
                                    name="name"
                                    required
                                    disabled={!canEditSetup}
                                    placeholder="Np. Biblioteka, kawiarnia, sala 204"
                                    className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">
                                    Adres i punkt na mapie
                                </label>

                                <MapboxPlacePicker disabled={!canEditSetup} />
                            </div>

                            <button
                                disabled={!canEditSetup}
                                className="w-full rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.30)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Dodaj miejsce
                            </button>
                        </form>

                        <div className="mt-6 space-y-3">
                            {placeOptions.length === 0 ? (
                                <p className="rounded-2xl border border-white/50 bg-white/40 p-4 text-sm text-slate-600">
                                    Nie dodano jeszcze żadnego miejsca.
                                </p>
                            ) : (
                                placeOptions.map((option) => {
                                    const counts = countPlaceVotes(option.id, allPlaceVotes);

                                    return (
                                        <div
                                            key={option.id}
                                            className="rounded-2xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl"
                                        >
                                            <p className="font-semibold text-slate-900">
                                                {option.name}
                                            </p>

                                            {option.address && (
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {option.address}
                                                </p>
                                            )}

                                            {showResults && (
                                                <div
                                                    className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold ${resultScoreClass(
                                                        counts
                                                    )}`}
                                                >
                                                    Tak: {counts.yes} | Może: {counts.maybe} | Nie:{" "}
                                                    {counts.no}
                                                </div>
                                            )}

                                            <form action={deletePlaceOptionAction} className="mt-3">
                                                <input type="hidden" name="eventId" value={event.id} />
                                                <input
                                                    type="hidden"
                                                    name="placeOptionId"
                                                    value={option.id}
                                                />

                                                <button
                                                    disabled={!canEditSetup}
                                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Usuń miejsce
                                                </button>
                                            </form>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-white/40 bg-white/35 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                        <div className="mb-5">
                            <div className="mb-2 inline-flex rounded-2xl bg-sky-700/10 px-3 py-1 text-sm font-medium text-sky-800">
                                Uczestnicy
                            </div>

                            <h2 className="text-xl font-bold text-slate-900">
                                Dodaj kolegów
                            </h2>

                            <p className="mt-2 text-sm text-slate-700">
                                Dodaj osoby, które otrzymają link po rozpoczęciu głosowania.
                                Organizator też może głosować, jeśli doda siebie jako
                                uczestnika.
                            </p>
                        </div>

                        <form action={addParticipantAction} className="space-y-4">
                            <input type="hidden" name="eventId" value={event.id} />

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">
                                    Imię
                                </label>

                                <input
                                    name="displayName"
                                    required
                                    disabled={!canEditSetup}
                                    placeholder="Np. Ania"
                                    className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-slate-800">
                                    E-mail
                                </label>

                                <input
                                    name="email"
                                    type="email"
                                    required
                                    disabled={!canEditSetup}
                                    placeholder="ania@example.com"
                                    className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                />
                            </div>

                            <button
                                disabled={!canEditSetup}
                                className="w-full rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.30)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Dodaj uczestnika
                            </button>
                        </form>

                        <div className="mt-6 space-y-3">
                            {participants.length === 0 ? (
                                <p className="rounded-2xl border border-white/50 bg-white/40 p-4 text-sm text-slate-600">
                                    Nie dodano jeszcze żadnych uczestników.
                                </p>
                            ) : (
                                participants.map((participant) => {
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

                                    const hasCompletedTimeVoting = timeOptions.every((option) =>
                                        votedTimeOptionIds.has(option.id)
                                    );

                                    const hasCompletedPlaceVoting = placeOptions.every((option) =>
                                        votedPlaceOptionIds.has(option.id)
                                    );

                                    const hasCompletedVoting =
                                        hasCompletedTimeVoting && hasCompletedPlaceVoting;
                                    return (
                                        <div
                                            key={participant.id}
                                            className="rounded-2xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl"
                                        >
                                            <p className="font-semibold text-slate-900">
                                                {participant.display_name || "Bez imienia"}
                                            </p>

                                            {participant.email && (
                                                <p className="mt-1 text-sm text-slate-600">
                                                    {participant.email}
                                                </p>
                                            )}

                                            {event.status !== "draft" && (
                                                <>
                                                    <div
                                                        className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                                                            hasCompletedVoting
                                                                ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                                                : "border-amber-200 bg-amber-100 text-amber-700"
                                                        }`}
                                                    >
                                                        {hasCompletedVoting
                                                            ? "Zagłosował"
                                                            : "Jeszcze nie zagłosował"}
                                                    </div>

                                                    <p className="mt-2 text-xs text-slate-500">
                                                        Terminy: {participantTimeVotes.length}/{timeOptions.length} | Miejsca:{" "}
                                                        {participantPlaceVotes.length}/{placeOptions.length}
                                                    </p>
                                                </>
                                            )}

                                            <form action={deleteParticipantAction} className="mt-3">
                                                <input type="hidden" name="eventId" value={event.id} />
                                                <input
                                                    type="hidden"
                                                    name="participantId"
                                                    value={participant.id}
                                                />

                                                <button
                                                    disabled={!canEditSetup}
                                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    Usuń uczestnika
                                                </button>
                                            </form>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}
