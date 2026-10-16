import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + hint/error, used by every form. */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | string[];
  className?: string;
  children: React.ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px]">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {message ? (
        <p className="text-xs text-destructive">{message}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Responsive grid for form fields. */
export function FormGrid({ children, cols = 3, className }: { children: React.ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        cols === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
