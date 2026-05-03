import Link from "next/link";

export default function HomePage() {
  return (
      <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#dbeafe,_#eff6ff_35%,_#e0e7ff_65%,_#f8fafc_100%)]">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute left-[-80px] top-[-80px] h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
          <div className="absolute right-[-100px] top-[80px] h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute bottom-[-100px] left-[20%] h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
        </div>

        <section className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16 text-center">
          <div className="rounded-full border border-white/40 bg-white/30 px-4 py-2 text-sm font-medium text-blue-900 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            Easy2Meet — planowanie spotkań w nowoczesnym stylu
          </div>

          <h1 className="mt-8 max-w-4xl text-5xl font-bold tracking-tight text-slate-900 md:text-6xl">
            Ustal termin i miejsce spotkania
            <span className="block bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-600 bg-clip-text text-transparent">
            szybko, wspólnie i bez chaosu
          </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-700">
            Twórz wydarzenia, dodawaj propozycje terminów i miejsc, zapraszaj
            uczestników do głosowania i zatwierdzaj finalny plan spotkania.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
                href="/dashboard"
                className="rounded-2xl border border-blue-700/30 bg-blue-700 px-6 py-3 font-semibold text-white shadow-[0_10px_30px_rgba(29,78,216,0.35)] transition hover:scale-[1.02] hover:bg-blue-800"
            >
              Przejdź do aplikacji
            </Link>

            <Link
                href="/sign-in"
                className="rounded-2xl border border-white/50 bg-white/35 px-6 py-3 font-semibold text-slate-800 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition hover:bg-white/50"
            >
              Zaloguj się
            </Link>
          </div>

          <div className="mt-16 grid w-full gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-white/40 bg-white/30 p-6 text-left backdrop-blur-2xl shadow-[0_10px_40px_rgba(30,41,59,0.08)]">
              <div className="mb-4 inline-flex rounded-2xl bg-blue-700/10 px-3 py-1 text-sm font-medium text-blue-800">
                Terminy
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Dodawaj wiele opcji
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                Dodaj kilka możliwych dat i godzin, aby uczestnicy mogli wybrać
                najlepszy termin.
              </p>
            </div>

            <div className="rounded-3xl border border-white/40 bg-white/30 p-6 text-left backdrop-blur-2xl shadow-[0_10px_40px_rgba(30,41,59,0.08)]">
              <div className="mb-4 inline-flex rounded-2xl bg-indigo-700/10 px-3 py-1 text-sm font-medium text-indigo-800">
                Miejsca
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Głosowanie na lokalizację
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                Zaproponuj różne miejsca i pozwól uczestnikom wybrać to
                najwygodniejsze.
              </p>
            </div>

            <div className="rounded-3xl border border-white/40 bg-white/30 p-6 text-left backdrop-blur-2xl shadow-[0_10px_40px_rgba(30,41,59,0.08)]">
              <div className="mb-4 inline-flex rounded-2xl bg-sky-700/10 px-3 py-1 text-sm font-medium text-sky-800">
                Finalizacja
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Finalny plan spotkania
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                Zamknij głosowanie i zatwierdź ostateczny termin oraz miejsce.
              </p>
            </div>
          </div>
        </section>
      </main>
  );
}