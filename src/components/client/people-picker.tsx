"use client";

import { useMemo, useState } from "react";

export type PickPerson = { id: string; name: string; employeeNo: string; sub?: string };

/** Daftar centang personel dengan pencarian & pilih semua. Mengirim field `personIds`. */
export function PeoplePicker({ people, defaultSelected = [] }: { people: PickPerson[]; defaultSelected?: string[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set(defaultSelected));
  const shown = useMemo(
    () => people.filter((p) => !q || `${p.name} ${p.employeeNo} ${p.sub ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [people, q]
  );
  const allShown = shown.length > 0 && shown.every((p) => sel.has(p.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari personel…" className="input" />
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() =>
            setSel((s) => {
              const n = new Set(s);
              shown.forEach((p) => (allShown ? n.delete(p.id) : n.add(p.id)));
              return n;
            })
          }
        >
          {allShown ? "Batal pilih" : "Pilih semua"}
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
        {shown.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-gray-50 px-3 py-2 text-sm last:border-0 hover:bg-gray-50">
            <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="accent-brand" />
            <span className="flex-1">
              <span className="font-medium">{p.name}</span> <span className="font-mono text-xs text-gray-400">{p.employeeNo}</span>
            </span>
            {p.sub && <span className="text-xs text-gray-500">{p.sub}</span>}
          </label>
        ))}
        {shown.length === 0 && <p className="px-3 py-4 text-center text-sm text-gray-400">Tidak ada personel</p>}
      </div>
      <p className="mt-1 text-xs text-gray-500">{sel.size} personel dipilih</p>
      {[...sel].map((id) => (
        <input key={id} type="hidden" name="personIds" value={id} />
      ))}
    </div>
  );
}
