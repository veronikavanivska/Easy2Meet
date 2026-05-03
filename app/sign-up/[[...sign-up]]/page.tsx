import { SignUp } from "@clerk/nextjs";

const clerkGlassAppearance = {
    variables: {
        colorPrimary: "#1d4ed8",
        colorBackground: "rgba(255, 255, 255, 0.55)",
        colorInputBackground: "rgba(255, 255, 255, 0.65)",
        colorText: "#0f172a",
        colorTextSecondary: "#475569",
        colorNeutral: "#334155",
        borderRadius: "1rem",
    },
    elements: {
        rootBox: "w-full",
        card:
            "bg-white/40 backdrop-blur-2xl border border-white/50 shadow-[0_20px_70px_rgba(30,64,175,0.18)] rounded-[28px]",
        headerTitle: "text-slate-900 text-2xl font-bold",
        headerSubtitle: "text-slate-600",
        socialButtonsBlockButton:
            "rounded-xl border border-white/50 bg-white/60 text-slate-800 hover:bg-white/80",
        formFieldLabel: "text-slate-700 font-medium",
        formFieldInput:
            "rounded-xl border border-white/60 bg-white/70 text-slate-900 placeholder:text-slate-400",
        formButtonPrimary:
            "rounded-xl bg-blue-700 text-white hover:bg-blue-800 shadow-[0_10px_30px_rgba(29,78,216,0.35)]",
        footerActionLink: "text-blue-700 hover:text-blue-900 font-semibold",
        dividerLine: "bg-slate-200",
        dividerText: "text-slate-500",
    },
};

export default function SignUpPage() {
    return (
        <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_#bfdbfe,_#dbeafe_35%,_#e0e7ff_70%,_#f8fafc_100%)] p-6">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute left-[-90px] top-[-90px] h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
                <div className="absolute right-[-120px] top-[90px] h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
                <div className="absolute bottom-[-140px] left-[28%] h-96 w-96 rounded-full bg-sky-500/25 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <SignUp appearance={clerkGlassAppearance} />
            </div>
        </main>
    );
}