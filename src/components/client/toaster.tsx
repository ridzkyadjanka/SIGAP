"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

type Toast = { id: number; ok: boolean; message: string };

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { ok: boolean; message: string };
      const id = Date.now() + Math.random();
      setItems((s) => [...s.slice(-3), { id, ...d }]);
      setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), d.ok ? 4000 : 7000);
    };
    window.addEventListener("sigap-toast", on);
    return () => window.removeEventListener("sigap-toast", on);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2 md:bottom-4">
      {items.map((t) => (
        <div key={t.id} role="alert" className={`pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${t.ok ? "bg-white text-emerald-800 ring-emerald-200" : "bg-white text-red-700 ring-red-200"}`}>
          {t.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-gray-400 hover:text-gray-600" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
