import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Print" };

// Printable documents (invoice, credit note) render outside the app shell.
// With Cache Components, reading the session cookie must happen inside a Suspense boundary.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: 24, fontFamily: "Arial, sans-serif", fontSize: 13 }}>Loading…</div>}>
      <Authenticated>{children}</Authenticated>
    </Suspense>
  );
}

async function Authenticated({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
