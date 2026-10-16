export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-wide">STUDIO RUBINA</div>
          <div className="text-sm text-muted-foreground">Inventory &amp; Sales</div>
        </div>
        {children}
      </div>
    </div>
  );
}
