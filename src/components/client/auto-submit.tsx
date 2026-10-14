"use client";

import type { ReactNode } from "react";

/** Form GET yang langsung terkirim ketika filter berubah. */
export function FilterForm({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t.dataset.noauto === undefined) (e.currentTarget as HTMLFormElement).requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
