"use client";

import { useState } from "react";

const CLS: Record<string, string> = {
  P: "bg-emerald-100 text-emerald-800",
  M: "bg-blue-100 text-blue-800",
  L: "bg-red-100 text-red-700",
};

function addDays(s: string, n: number) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Input tanggal awal siklus + pratinjau roster 28 hari. */
export function RosterStartPreview({ pattern, defaultDate }: { pattern: string[]; defaultDate: string }) {
  const [start, setStart] = useState(defaultDate);
  const days = Array.from({ length: 28 }, (_, i) => ({ date: addDays(start, i), code: pattern[i % pattern.length] }));
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label">Tanggal Awal Siklus (Hari ke-1 = Shift Pagi)</span>
        <input type="date" name="startDate" value={start} onChange={(e) => setStart(e.target.value)} className="input" required />
      </label>
      <div>
        <p className="label">Preview 28 hari</p>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={d.date} className={`rounded-md px-1 py-1.5 text-center ${CLS[d.code]}`}>
              <div className="text-[10px] opacity-70">H{(i % pattern.length) + 1} · {d.date.slice(8)}/{d.date.slice(5, 7)}</div>
              <div className="text-sm font-bold">{d.code}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
