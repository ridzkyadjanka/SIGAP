"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const Ctx = createContext<{ close: () => void } | null>(null);
export const useDialog = () => useContext(Ctx);

export function Dialog({
  trigger,
  title,
  description,
  children,
  triggerClassName = "btn-primary",
  size = "md",
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  triggerClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" className={`max-h-[92vh] w-full ${width} overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-navy">{title}</h3>
                {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-navy" aria-label="Tutup">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 py-5">
              <Ctx.Provider value={{ close: () => setOpen(false) }}>{children}</Ctx.Provider>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
