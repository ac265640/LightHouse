"use client";

import clsx from "clsx";
import {
  Activity, BookOpen, FlaskConical, LayoutDashboard, Megaphone, Menu, Sparkles, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { API_URL } from "@/lib/api";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/campaign", label: "Campaign Planner", icon: Megaphone },
  { href: "/playbook", label: "Playbook", icon: BookOpen },
  { href: "/copilot", label: "Copilot", icon: Sparkles },
  { href: "/model", label: "Model Lab", icon: FlaskConical },
  { href: "/monitoring", label: "Monitoring", icon: Activity },
];

function ApiStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/health`).then((r) => setOk(r.ok)).catch(() => setOk(false));
  }, []);
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span className={clsx("h-1.5 w-1.5 rounded-full",
        ok == null ? "bg-faint" : ok ? "bg-good shadow-[0_0_8px_var(--good)]" : "bg-bad")} />
      {ok == null ? "Connecting…" : ok ? "Model v1.0 · live" : "API offline"}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={clsx("group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition",
              active ? "bg-panel-2 text-text" : "text-muted hover:bg-white/[0.03] hover:text-text")}>
            <Icon size={16} className={active ? "text-beam" : "text-faint group-hover:text-muted"} />
            {label}
            {href === "/copilot" && (
              <span className="ml-auto rounded bg-violet/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-violet">AI</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-bg/70 px-4 py-6 backdrop-blur lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <Logo />
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Lighthouse</div>
            <div className="label !text-[9px] !tracking-[0.2em]">Retention Intelligence</div>
          </div>
        </Link>
        {nav}
        <div className="mt-auto space-y-3 border-t border-line px-2 pt-4">
          <ApiStatus />
          <div className="text-[11px] leading-relaxed text-faint">
            DataNova 2026 · DN-BU-01<br />Customer Churn &amp; Retention
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={24} /><span className="font-semibold">Lighthouse</span>
          </Link>
          <button onClick={() => setOpen(!open)} className="rounded-md p-1.5 text-muted hover:text-text" aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        {open && <div className="border-b border-line bg-bg-2 px-4 py-3 lg:hidden">{nav}</div>}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 md:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
