import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function DashboardPage() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const supabase = createSupabaseAdminClient();

    const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .eq("organizer_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(error.message);
    }

    return (
        <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#bfdbfe,_#dbeafe_35%,_#e0e7ff_70%,_#f8fafc_100%)]">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-[-100px] top-[-60px] h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />
                <div className="absolute right-[-100px] top-[120px] h-80 w-80 rounded-full bg-indigo-600/20 blur-3xl" />
            </div>

            <header className="relative border-b border-white/30 bg-white/20 backdrop-blur-2xl">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                    <Link href="/" className="text-xl font-bold text-blue-800">
                        Easy2Meet
                    </Link>

                    <div className="rounded-2xl border border-white/40 bg-white/30 p-2 backdrop-blur-xl">
                        <UserButton />
                    </div>
                </div>
            </header>

            <section className="relative mx-auto max-w-6xl px-6 py-10">
                <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/40 bg-white/35 p-8 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.12)] md:flex-row md:items-center">
                    <div>
                        <div className="mb-3 inline-flex rounded-2xl bg-blue-700/10 px-3 py-1 text-sm font-medium text-blue-800">
                            Panel organizatora
                        </div>

                        <h1 className="text-3xl font-bold text-slate-900">
                            Moje wydarzenia
                        </h1>

                        <p className="mt-2 text-slate-700">
                            Zarządzaj wydarzeniami, propozycjami terminów i głosowaniami.
                        </p>
                    </div>

                    <Link
                        href="/events/new"
                        className="inline-flex rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.35)] transition hover:scale-[1.02] hover:bg-blue-800"
                    >
                        Utwórz wydarzenie
                    </Link>
                </div>

                {events.length === 0 ? (
                    <div className="mt-8 rounded-3xl border border-white/40 bg-white/35 p-10 text-center backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)]">
                        <h2 className="text-xl font-semibold text-slate-900">
                            Brak wydarzeń
                        </h2>

                        <p className="mt-2 text-slate-700">
                            Po utworzeniu wydarzenia pojawi się ono w tym miejscu.
                        </p>
                    </div>
                ) : (
                    <div className="mt-8 grid gap-5 md:grid-cols-2">
                        {events.map((event) => (
                            <Link
                                key={event.id}
                                href={`/events/${event.id}`}
                                className="rounded-3xl border border-white/40 bg-white/35 p-6 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.10)] transition hover:scale-[1.01] hover:bg-white/45"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">
                                            {event.title}
                                        </h2>

                                        <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                                            {event.description || "Brak opisu"}
                                        </p>
                                    </div>

                                    <span className="rounded-full bg-blue-700/10 px-3 py-1 text-xs font-semibold text-blue-800">
                    {event.status}
                  </span>
                                </div>

                                <p className="mt-6 text-xs text-slate-500">
                                    Utworzono:{" "}
                                    {new Date(event.created_at).toLocaleString("pl-PL")}
                                </p>
                            </Link>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
