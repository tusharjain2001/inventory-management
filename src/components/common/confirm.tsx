"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  destructive?: boolean;
  /** Ask for a reason; the promise resolves to the entered text (required) or false. */
  reason?: { label: string; placeholder?: string };
};

type ConfirmFn = {
  (opts: ConfirmOptions & { reason: { label: string; placeholder?: string } }): Promise<string | false>;
  (opts: ConfirmOptions): Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Promise-based confirm dialog: `if (await confirm({ title: "Delete?" })) …` */
export function useConfirm() {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm must be used inside ConfirmProvider");
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState("");
  const resolver = useRef<((v: boolean | string) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setReason("");
    setOpts(o);
    return new Promise<boolean | string>((resolve) => {
      resolver.current = resolve;
    });
  }, []) as ConfirmFn;

  function close(result: boolean) {
    const r = resolver.current;
    resolver.current = null;
    setOpts(null);
    if (!r) return;
    if (!result) r(false);
    else r(opts?.reason ? reason.trim() : true);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(o) => !o && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {opts?.reason && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{opts.reason.label}</label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={opts.reason.placeholder} autoFocus />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={opts?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
              disabled={!!opts?.reason && !reason.trim()}
              onClick={(e) => {
                e.preventDefault();
                close(true);
              }}
            >
              {opts?.confirmText ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}
