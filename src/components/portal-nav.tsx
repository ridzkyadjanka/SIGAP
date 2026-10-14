"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, CalendarDays, Bell } from "lucide-react";

const ITEMS = [
  { href: "/portal", label: "Penugasan Hari Ini", icon: ClipboardCheck },
  { href: "/portal/roster", label: "Roster Saya", icon: CalendarDays },
];

export function PortalNav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <>
      <nav className="hidden items-center gap-1 md:flex">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${path === i.href ? "bg-white/10 text-white" : "text-white/70 hover:text-white"}`}>
            <i.icon className="h-4 w-4" /> {i.label}
          </Link>
        ))}
      </nav>
      <Link href="/portal/notifikasi" className="relative rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Notifikasi">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread}</span>}
      </Link>
      {/* Navigasi bawah (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${path === i.href ? "text-brand" : "text-gray-500"}`}>
            <i.icon className="h-5 w-5" /> {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
