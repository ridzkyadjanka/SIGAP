"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { ActionResult, FormAction } from "@/lib/action";
import { useDialog } from "./dialog";

export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
  showMessage = true,
  onSuccess,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  showMessage?: boolean;
  onSuccess?: (r: ActionResult) => void;
}) {
  // Bungkus action agar hasilnya juga dikirim ke Toaster global (tetap tampil walau form ter-unmount)
  const wrapped = async (prev: ActionResult, fd: FormData) => {
    const r = await action(prev, fd);
    // Sukses → toast global; gagal → pesan inline di dekat form (atau toast bila pesan inline dimatikan)
    if (r?.message && (r.ok || !showMessage) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sigap-toast", { detail: r }));
    }
    return r;
  };
  const [state, formAction] = useActionState(wrapped, null);
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useDialog();

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
      if (dialog) {
        const t = setTimeout(() => dialog.close(), 150);
        return () => clearTimeout(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {showMessage && state?.message && !state.ok && (
        <div
          role="status"
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {state.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{state.message}</span>
        </div>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Menyimpan…",
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? pendingText : children}
    </button>
  );
}
