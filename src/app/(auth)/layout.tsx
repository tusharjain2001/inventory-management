export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-full.png" alt="Studio Rubina" className="h-28 w-auto" />
          <div className="mt-2 text-sm text-muted-foreground">Inventory &amp; Sales</div>
        </div>
        {children}
      </div>
    </div>
  );
}
