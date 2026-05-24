import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
    "/dashboard(.*)",
    "/events(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
    if (isProtectedRoute(req)) {
        await auth.protect();
    }
});

export const config = {
    matcher: [
        "/dashboard(.*)",
        "/events(.*)",
        "/api(.*)",
        "/trpc(.*)",
    ],
};