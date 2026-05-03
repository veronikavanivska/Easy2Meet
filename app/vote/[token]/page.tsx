import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StatusMessage } from "../../components/StatusMessage";
import {
    identifyParticipantAction,
    proposePlaceOptionAction,
    proposeTimeOptionAction,
    voteForPlaceAction,
    voteForTimeAction,
} from "./actions";

type PageProps = {
    params: Promise<{
        token: string;
    }>;
    searchParams: Promise<{
        email?: string;
        error?: string;
        success?: string;
    }>;
};

type EventRecord = {
    id: string;
    title: string;
    description: string | null;
    public_token: string;
    status: string;
    voting_deadline: string | null;
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
};

type Participant = {
    id: string;
    event_id: string;
    display_name: string | null;
    email: string;
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

function voteLabel(vote: string | null | undefined) {
    if (vote === "yes") return "Twój głos: Tak";
    if (vote === "maybe") return "Twój głos: Może";
    if (vote === "no") return "Twój głos: Nie";

    return "Nie głosowano";
}

function voteBadgeClass(vote: string | null | undefined) {
    if (vote === "yes") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (vote === "maybe") return "bg-amber-100 text-amber-700 border-amber-200";
    if (vote === "no") return "bg-red-100 text-red-700 border-red-200";

    return "bg-slate-100 text-slate-600 border-slate-200";
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

export default async function VotePage({ params, searchParams }: PageProps) {
    const { token } = await params;
    const {
        email: participantEmailRaw,
        error: errorMessage,
        success: successMessage,
    } = await searchParams;

    const participantEmail = participantEmailRaw?.trim().toLowerCase() || "";

    const supabase = createSupabaseAdminClient();

    const { data: eventData } = await supabase
        .from("events")
        .select("*")
        .eq("public_token", token)
        .single();

    if (!eventData) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="rounded-3xl border bg-white p-8 shadow-sm">
                    <h1 className="text-xl font-bold text-slate-900">
                        Nie znaleziono wydarzenia
                    </h1>

                    <p className="mt-2 text-sm text-slate-600">
                        Link do głosowania jest nieprawidłowy albo wydarzenie zostało
                        usunięte.
                    </p>

                    <Link
                        href="/"
                        className="mt-4 inline-flex rounded-xl bg-blue-700 px-4 py-2 font-semibold text-white"
                    >
                        Wróć do strony głównej
                    </Link>
                </div>
            </main>
        );
    }

    const event = await closeEventIfDeadlinePassed(eventData as EventRecord);

    const { data: timeOptionsData } = await supabase
        .from("time_options")
        .select("*")
        .eq("event_id", event.id)
        .order("starts_at", { ascending: true });

    const { data: placeOptionsData } = await supabase
        .from("place_options")
        .select("*")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true });

    const timeOptions = (timeOptionsData ?? []) as TimeOption[];
    const placeOptions = (placeOptionsData ?? []) as PlaceOption[];

    let participant: Participant | null = null;

    if (participantEmail) {
        const { data } = await supabase
            .from("participants")
            .select("*")
            .eq("event_id", event.id)
            .eq("email", participantEmail)
            .maybeSingle();

        participant = (data as Participant | null) ?? null;
    }

    const { data: timeVotesData } = participant
        ? await supabase
            .from("time_votes")
            .select("*")
            .eq("event_id", event.id)
            .eq("participant_id", participant.id)
        : { data: [] };

    const { data: placeVotesData } = participant
        ? await supabase
            .from("place_votes")
            .select("*")
            .eq("event_id", event.id)
            .eq("participant_id", participant.id)
        : { data: [] };

    const timeVotes = (timeVotesData ?? []) as TimeVote[];
    const placeVotes = (placeVotesData ?? []) as PlaceVote[];

    const votedTimeOptionIds = new Set(
        timeVotes.map((vote) => vote.time_option_id)
    );

    const votedPlaceOptionIds = new Set(
        placeVotes.map((vote) => vote.place_option_id)
    );

    const completedTimeVotes = votedTimeOptionIds.size;
    const completedPlaceVotes = votedPlaceOptionIds.size;

    const hasCompletedTimeVoting =
        timeOptions.length > 0 &&
        timeOptions.every((option) => votedTimeOptionIds.has(option.id));

    const hasCompletedPlaceVoting =
        placeOptions.length > 0 &&
        placeOptions.every((option) => votedPlaceOptionIds.has(option.id));

    const hasCompletedVoting = hasCompletedTimeVoting && hasCompletedPlaceVoting;

    const canVote = event.status === "voting";
    const isClosed = event.status === "closed";
    const isDraft = event.status === "draft";

    return (
        <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#bfdbfe,_#dbeafe_35%,_#e0e7ff_70%,_#f8fafc_100%)]">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-[-100px] top-[-80px] h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
                <div className="absolute right-[-120px] top-[140px] h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="absolute bottom-[-140px] left-[25%] h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
            </div>

            <section className="relative mx-auto max-w-6xl px-6 py-10">
                <Link
                    href="/"
                    className="text-sm font-semibold text-blue-800 hover:text-blue-900"
                >
                    ← Easy2Meet
                </Link>

                <StatusMessage
                    error={errorMessage}
                    success={successMessage}
                    durationMs={4000}
                />

                <div className="mt-6 rounded-3xl border border-white/40 bg-white/35 p-8 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.12)]">
                    <div className="mb-3 inline-flex rounded-2xl bg-blue-700/10 px-3 py-1 text-sm font-medium text-blue-800">
                        Status: {event.status}
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

                    {isDraft && (
                        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm font-medium text-amber-700">
                            Głosowanie nie zostało jeszcze rozpoczęte przez organizatora.
                        </div>
                    )}

                    {isClosed && (
                        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm font-medium text-red-700">
                            Głosowanie zostało zamknięte. Nie można już oddawać ani zmieniać
                            głosów.
                        </div>
                    )}
                </div>

                <div className="mt-8 rounded-3xl border border-white/40 bg-white/35 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                    <div className="mb-5">
                        <div className="mb-2 inline-flex rounded-2xl bg-sky-700/10 px-3 py-1 text-sm font-medium text-sky-800">
                            Identyfikacja uczestnika
                        </div>

                        <h2 className="text-xl font-bold text-slate-900">
                            Podaj swój e-mail
                        </h2>

                        <p className="mt-2 text-sm text-slate-700">
                            Wpisz adres e-mail, który organizator dodał do listy uczestników.
                        </p>
                    </div>

                    <form
                        action={identifyParticipantAction}
                        className="grid gap-4 md:grid-cols-[1fr_auto]"
                    >
                        <input type="hidden" name="token" value={token} />

                        <input
                            name="email"
                            type="email"
                            required
                            defaultValue={participantEmail}
                            placeholder="twoj.email@example.com"
                            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                        />

                        <button className="rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.30)] transition hover:bg-blue-800">
                            Potwierdź
                        </button>
                    </form>

                    {participant && (
                        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-700">
                            <p>
                                Głosujesz jako:{" "}
                                <span className="font-semibold">
                  {participant.display_name} ({participant.email})
                </span>
                            </p>

                            <p className="mt-2 font-semibold">Postęp głosowania:</p>

                            <p className="mt-1">
                                Terminy: {completedTimeVotes}/{timeOptions.length} | Miejsca:{" "}
                                {completedPlaceVotes}/{placeOptions.length}
                            </p>

                            {hasCompletedVoting ? (
                                <p className="mt-2 rounded-xl border border-emerald-200 bg-white/60 px-3 py-2 text-xs font-semibold text-emerald-700">
                                    Oddałaś/oddałeś głosy na wszystkie dostępne propozycje.
                                </p>
                            ) : (
                                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-700">
                                    Głosowanie nie jest jeszcze kompletne — oceń wszystkie terminy
                                    i wszystkie miejsca.
                                </p>
                            )}
                        </div>
                    )}

                    {participantEmail && !participant && (
                        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
                            Ten e-mail nie znajduje się na liście uczestników wydarzenia.
                        </div>
                    )}
                </div>

                {!participant ? (
                    <div className="mt-8 rounded-3xl border border-white/40 bg-white/35 p-10 text-center backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                        <h2 className="text-xl font-bold text-slate-900">
                            Najpierw potwierdź e-mail
                        </h2>

                        <p className="mt-2 text-slate-700">
                            Po potwierdzeniu e-maila pojawią się opcje głosowania i dodawania
                            własnych propozycji.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mt-8 rounded-3xl border border-white/40 bg-white/35 p-5 text-sm text-slate-700 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                            <p className="font-semibold text-slate-900">Twój postęp</p>

                            <p className="mt-1">
                                Terminy: {completedTimeVotes}/{timeOptions.length} | Miejsca:{" "}
                                {completedPlaceVotes}/{placeOptions.length}
                            </p>
                        </div>

                        <div className="mt-8 grid gap-6 lg:grid-cols-2">
                            <section className="rounded-3xl border border-white/40 bg-white/35 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                                <div className="mb-5">
                                    <div className="mb-2 inline-flex rounded-2xl bg-blue-700/10 px-3 py-1 text-sm font-medium text-blue-800">
                                        Terminy
                                    </div>

                                    <h2 className="text-xl font-bold text-slate-900">
                                        Głosuj na termin
                                    </h2>

                                    <p className="mt-2 text-sm text-slate-700">
                                        Oceń każdy termin: Tak / Może / Nie.
                                    </p>
                                </div>

                                <form
                                    action={proposeTimeOptionAction}
                                    className="mb-6 rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur-xl"
                                >
                                    <input type="hidden" name="token" value={token} />
                                    <input
                                        type="hidden"
                                        name="participantEmail"
                                        value={participant.email}
                                    />

                                    <h3 className="font-semibold text-slate-900">
                                        Zaproponuj inny termin
                                    </h3>

                                    <div className="mt-4 space-y-3">
                                        <input
                                            name="startsAt"
                                            type="datetime-local"
                                            required
                                            disabled={!canVote}
                                            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                        />

                                        <input
                                            name="endsAt"
                                            type="datetime-local"
                                            disabled={!canVote}
                                            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                        />

                                        <button
                                            disabled={!canVote}
                                            className="w-full rounded-2xl bg-blue-700 px-4 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.30)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Dodaj propozycję terminu
                                        </button>
                                    </div>
                                </form>

                                <div className="space-y-4">
                                    {timeOptions.length === 0 ? (
                                        <p className="rounded-2xl border border-white/50 bg-white/40 p-4 text-sm text-slate-600">
                                            Organizator nie dodał jeszcze terminów.
                                        </p>
                                    ) : (
                                        timeOptions.map((option) => {
                                            const existingVote = timeVotes.find(
                                                (vote) => vote.time_option_id === option.id
                                            );

                                            return (
                                                <div
                                                    key={option.id}
                                                    className="rounded-2xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl"
                                                >
                                                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                                                        <div>
                                                            <p className="font-semibold text-slate-900">
                                                                {new Date(option.starts_at).toLocaleString(
                                                                    "pl-PL"
                                                                )}
                                                            </p>

                                                            {option.ends_at && (
                                                                <p className="mt-1 text-sm text-slate-600">
                                                                    Do:{" "}
                                                                    {new Date(option.ends_at).toLocaleString(
                                                                        "pl-PL"
                                                                    )}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <span
                                                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${voteBadgeClass(
                                                                existingVote?.vote
                                                            )}`}
                                                        >
                              {voteLabel(existingVote?.vote)}
                            </span>
                                                    </div>

                                                    <form
                                                        action={voteForTimeAction}
                                                        className="mt-4 flex flex-wrap gap-2"
                                                    >
                                                        <input type="hidden" name="token" value={token} />
                                                        <input
                                                            type="hidden"
                                                            name="eventId"
                                                            value={event.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="participantId"
                                                            value={participant.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="participantEmail"
                                                            value={participant.email}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="timeOptionId"
                                                            value={option.id}
                                                        />

                                                        <button
                                                            name="vote"
                                                            value="yes"
                                                            disabled={!canVote}
                                                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Tak
                                                        </button>

                                                        <button
                                                            name="vote"
                                                            value="maybe"
                                                            disabled={!canVote}
                                                            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Może
                                                        </button>

                                                        <button
                                                            name="vote"
                                                            value="no"
                                                            disabled={!canVote}
                                                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Nie
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
                                        Głosuj na miejsce
                                    </h2>

                                    <p className="mt-2 text-sm text-slate-700">
                                        Oceń każde miejsce: Tak / Może / Nie.
                                    </p>
                                </div>

                                <form
                                    action={proposePlaceOptionAction}
                                    className="mb-6 rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur-xl"
                                >
                                    <input type="hidden" name="token" value={token} />
                                    <input
                                        type="hidden"
                                        name="participantEmail"
                                        value={participant.email}
                                    />

                                    <h3 className="font-semibold text-slate-900">
                                        Zaproponuj inne miejsce
                                    </h3>

                                    <div className="mt-4 space-y-3">
                                        <input
                                            name="name"
                                            required
                                            disabled={!canVote}
                                            placeholder="Nazwa miejsca"
                                            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                        />

                                        <input
                                            name="address"
                                            disabled={!canVote}
                                            placeholder="Adres opcjonalnie"
                                            className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 disabled:opacity-50"
                                        />

                                        <button
                                            disabled={!canVote}
                                            className="w-full rounded-2xl bg-blue-700 px-4 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.30)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Dodaj propozycję miejsca
                                        </button>
                                    </div>
                                </form>

                                <div className="space-y-4">
                                    {placeOptions.length === 0 ? (
                                        <p className="rounded-2xl border border-white/50 bg-white/40 p-4 text-sm text-slate-600">
                                            Organizator nie dodał jeszcze miejsc.
                                        </p>
                                    ) : (
                                        placeOptions.map((option) => {
                                            const existingVote = placeVotes.find(
                                                (vote) => vote.place_option_id === option.id
                                            );

                                            return (
                                                <div
                                                    key={option.id}
                                                    className="rounded-2xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl"
                                                >
                                                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                                                        <div>
                                                            <p className="font-semibold text-slate-900">
                                                                {option.name}
                                                            </p>

                                                            {option.address && (
                                                                <p className="mt-1 text-sm text-slate-600">
                                                                    {option.address}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <span
                                                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${voteBadgeClass(
                                                                existingVote?.vote
                                                            )}`}
                                                        >
                              {voteLabel(existingVote?.vote)}
                            </span>
                                                    </div>

                                                    <form
                                                        action={voteForPlaceAction}
                                                        className="mt-4 flex flex-wrap gap-2"
                                                    >
                                                        <input type="hidden" name="token" value={token} />
                                                        <input
                                                            type="hidden"
                                                            name="eventId"
                                                            value={event.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="participantId"
                                                            value={participant.id}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="participantEmail"
                                                            value={participant.email}
                                                        />
                                                        <input
                                                            type="hidden"
                                                            name="placeOptionId"
                                                            value={option.id}
                                                        />

                                                        <button
                                                            name="vote"
                                                            value="yes"
                                                            disabled={!canVote}
                                                            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Tak
                                                        </button>

                                                        <button
                                                            name="vote"
                                                            value="maybe"
                                                            disabled={!canVote}
                                                            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Może
                                                        </button>

                                                        <button
                                                            name="vote"
                                                            value="no"
                                                            disabled={!canVote}
                                                            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Nie
                                                        </button>
                                                    </form>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </section>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}
