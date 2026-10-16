import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SessionProvider } from "@/components/session-provider";
import { AppShell } from "@/components/app-shell";

// With Cache Components, reading the session cookie must happen inside a Suspense boundary.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <Authenticated>{children}</Authenticated>
    </Suspense>
  );
}

async function Authenticated({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <SessionProvider user={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
