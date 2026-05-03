import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createEventAction } from "./actions";

type PageProps = {
    searchParams: Promise<{
        error?: string;
        success?: string;
    }>;
};

export default async function NewEventPage({ searchParams }: PageProps) {
    const { error: errorMessage, success: successMessage } = await searchParams;

    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    return (
        <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#bfdbfe,_#dbeafe_35%,_#e0e7ff_70%,_#f8fafc_100%)]">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-[-100px] top-[-80px] h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
                <div className="absolute right-[-120px] top-[140px] h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="absolute bottom-[-140px] left-[25%] h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
            </div>

            <section className="relative mx-auto max-w-3xl px-6 py-10">
                <Link
                    href="/dashboard"
                    className="text-sm font-semibold text-blue-800 hover:text-blue-900"
                >
                    ← Wróć do dashboardu
                </Link>

                {errorMessage && (
                    <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm font-medium text-red-700 shadow-sm backdrop-blur-xl">
                        {errorMessage}
                    </div>
                )}

                {successMessage && (
                    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm font-medium text-emerald-700 shadow-sm backdrop-blur-xl">
                        {successMessage}
                    </div>
                )}

                <div className="mt-6 rounded-3xl border border-white/40 bg-white/35 p-8 backdrop-blur-2xl shadow-[0_20px_70px_rgba(30,64,175,0.12)]">
                    <div className="mb-8">
                        <div className="mb-3 inline-flex rounded-2xl border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                            Nowe wydarzenie
                        </div>

                        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
                            Utwórz wydarzenie
                        </h1>

                        <p className="mt-4 max-w-2xl text-slate-700">
                            Najpierw podaj podstawowe informacje. Wydarzenie zostanie zapisane
                            jako robocze. Terminy, miejsca i uczestników dodasz w następnym
                            kroku.
                        </p>
                    </div>

                    <form action={createEventAction} className="space-y-6">
                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-800">
                                Tytuł wydarzenia
                            </label>

                            <input
                                name="title"
                                required
                                placeholder="Np. Spotkanie projektowe"
                                className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-semibold text-slate-800">
                                Opis opcjonalnie
                            </label>

                            <textarea
                                name="description"
                                rows={5}
                                placeholder="Krótki opis wydarzenia, cel spotkania albo dodatkowe informacje dla uczestników"
                                className="w-full resize-none rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                            />
                        </div>

                        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
                            <p className="font-semibold">Wydarzenie będzie robocze.</p>
                            <p className="mt-1">
                                Po utworzeniu dodasz propozycje terminów, miejsc oraz
                                uczestników. E-maile z linkiem do głosowania zostaną wysłane
                                dopiero po kliknięciu „Rozpocznij głosowanie”.
                            </p>
                        </div>

                        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                            <Link
                                href="/dashboard"
                                className="inline-flex justify-center rounded-2xl border border-white/50 bg-white/50 px-5 py-3 font-semibold text-slate-700 transition hover:bg-white/70"
                            >
                                Anuluj
                            </Link>

                            <button className="inline-flex justify-center rounded-2xl border border-blue-700/30 bg-blue-700 px-5 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.35)] transition hover:bg-blue-800">
                                Utwórz wydarzenie
                            </button>
                        </div>
                    </form>
                </div>
            </section>
        </main>
    );
}