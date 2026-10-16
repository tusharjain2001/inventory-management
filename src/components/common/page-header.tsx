import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  back,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Href for a back link shown above the title. */
  back?: { href: string; label: string };
  /** Action buttons, right-aligned. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 print:hidden">
      {back && (
        <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
