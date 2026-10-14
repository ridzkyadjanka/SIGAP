"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, Truck, MapPinned, CalendarDays, ClipboardList, Plane, BellRing,
  FileBarChart2, UserCog, Settings, Menu, X, ChevronDown,
} from "lucide-react";
import { Logo } from "@/components/logo";

type Item = { label: string; href?: string; icon: keyof typeof ICONS; children?: { label: string; href: string }[] };

const ICONS = {
  dashboard: LayoutDashboard,
  manpower: Users,
  fleet: Truck,
  pit: MapPinned,
  roster: CalendarDays,
  assign: ClipboardList,
  leave: Plane,
  warning: BellRing,
  report: FileBarChart2,
  users: UserCog,
  settings: Settings,
};

export const MENU: Item[] = [
  { label: "Dashboard", href: "/admin", icon: "dashboard" },
  { label: "Manpower", icon: "manpower", children: [
    { label: "Operator", href: "/admin/manpower/operator" },
    { label: "Group Leader", href: "/admin/manpower/group-leader" },
  ] },
  { label: "Fleet & Equipment", icon: "fleet", children: [
    { label: "Unit", href: "/admin/fleet" },
    { label: "Setting Fleet", href: "/admin/fleet/setting" },
  ] },
  { label: "Lokasi / PIT", href: "/admin/pit", icon: "pit" },
  { label: "Roster & Jadwal", icon: "roster", children: [
    { label: "Roster Operator", href: "/admin/roster?cat=OPERATOR" },
    { label: "Roster GL", href: "/admin/roster?cat=GROUP_LEADER" },
    { label: "Template Shift", href: "/admin/roster/shift" },
  ] },
  { label: "Penugasan Harian", icon: "assign", children: [
    { label: "Daily Manpower", href: "/admin/penugasan" },
    { label: "Riwayat Perubahan", href: "/admin/penugasan/riwayat" },
  ] },
  { label: "Cuti & Absensi", icon: "leave", children: [
    { label: "Cuti Periodik", href: "/admin/cuti" },
    { label: "Status Kehadiran", href: "/admin/cuti/kehadiran" },
  ] },
  { label: "Notifikasi Cuti", icon: "warning", children: [
    { label: "Early Warning", href: "/admin/early-warning" },
    { label: "Replacement Planning", href: "/admin/early-warning/pengganti" },
  ] },
  { label: "Laporan", href: "/admin/laporan", icon: "report" },
  { label: "User Management", href: "/admin/users", icon: "users" },
  { label: "Pengaturan", icon: "settings", children: [
    { label: "Shift & Pola Kerja", href: "/admin/pengaturan" },
    { label: "Tampilan Website", href: "/admin/pengaturan/tampilan" },
    { label: "Audit Log", href: "/admin/pengaturan/audit" },
  ] },
];

function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(path + "/");
}

function bestMatch(pathname: string): string | null {
  let best: string | null = null;
  for (const m of MENU) {
    const links = m.children?.map((c) => c.href) ?? [m.href!];
    for (const l of links) {
      const p = l.split("?")[0];
      if (isActive(pathname, l) && (!best || p.length > best.split("?")[0].length)) best = l;
    }
  }
  return best;
}

export function Sidebar({ logo }: { logo?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = bestMatch(pathname);
  const query = useSearchParams().toString();
  useEffect(() => setOpen(false), [pathname, query]);

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {MENU.map((m) => {
        const Icon = ICONS[m.icon];
        if (!m.children) {
          const on = active === m.href;
          return (
            <Link
              key={m.label}
              href={m.href!}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                on ? "bg-brand text-white shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" /> {m.label}
            </Link>
          );
        }
        const groupActive = m.children.some((c) => c.href === active || (active && c.href.split("?")[0] === active.split("?")[0]));
        return (
          <details key={m.label} open={groupActive} className="group">
            <summary
              className={`flex cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                groupActive ? "text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{m.label}</span>
              <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="mt-1 space-y-0.5 border-l border-white/10 pl-4 ml-5">
              {m.children.map((c) => {
                const [cp, cq] = c.href.split("?");
                const on = cq ? pathname === cp && query.includes(cq) : c.href === active && !(cp === "/admin/roster" && query.includes("cat="));
                const onRoster = cp === "/admin/roster" && pathname === "/admin/roster" && !query.includes("cat=") && c.label === "Roster Operator";
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    className={`block rounded-md px-3 py-1.5 text-sm transition ${
                      on || onRoster ? "bg-white/10 font-semibold text-white" : "text-white/60 hover:text-white"
                    }`}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </div>
          </details>
        );
      })}
    </nav>
  );

  return (
    <>
      <button className="btn-ghost fixed left-3 top-3 z-30 px-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
        <Menu className="h-5 w-5" />
      </button>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Link href="/admin"><Logo light src={logo} /></Link>
        </div>
        {nav}
        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-white/40">SIGAP v1.0 · Admin Panel</div>
      </aside>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-navy shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <Logo light src={logo} />
              <button className="text-white/70" onClick={() => setOpen(false)} aria-label="Tutup menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
