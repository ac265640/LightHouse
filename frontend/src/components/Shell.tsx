"use client";

import clsx from "clsx";
import {
  Activity, ArrowUpRight, BookOpen, FlaskConical, LayoutDashboard, Megaphone, Menu, MessageSquareText, Users, X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { API_URL, SNAPSHOT } from "@/lib/api";
import { Logo } from "./Logo";

const GROUPS = [
  {
    name: "Act",
    items: [
      { href: "/overview", label: "Overview", icon: LayoutDashboard },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/campaign", label: "Campaign planner", icon: Megaphone },
      { href: "/playbook", label: "Playbook", icon: BookOpen },
    ],
  },
  {
    name: "Ask",
    items: [{ href: "/copilot", label: "Copilot", icon: MessageSquareText }],
  },
  {
    name: "Trust",
    items: [
      { href: "/model", label: "Model lab", icon: FlaskConical },
      { href: "/monitoring", label: "Monitoring", icon: Activity },
    ],
  },
];

function ApiStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/health`).then((r) => setOk(r.ok)).catch(() => setOk(false));
  }, []);
  return (
    <div className="flex items-center gap-2 text-[13px] text-faint">
      <span className={clsx("h-1.5 w-1.5 rounded-full", ok == null ? "bg-faint" : ok ? "bg-good" : "bg-bad")} />
      {SNAPSHOT
        ? ok == null ? "Waking the live model" : ok ? "Live model ready" : "Live model asleep"
        : ok == null ? "Connecting" : ok ? "Model v1.0 live" : "API offline"}
    </div>
  );
}

function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <div key={g.name}>
          <div className="mb-1.5 px-3 text-[13px] text-faint">{g.name}</div>
          <div className="flex flex-col gap-0.5">
            {g.items.map(({ href, label, icon: Icon }) => {
              const active = path.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined}
                  className={clsx("group relative flex h-8 items-center gap-2.5 rounded-md px-3 text-[14px] transition-colors duration-200",
                    active ? "bg-panel-2 text-text" : "text-muted hover:bg-panel hover:text-text")}>
                  <Icon size={16} strokeWidth={1.6} className={active ? "text-lamp" : "text-faint group-hover:text-muted"} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function PageFade({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <div key={path} className="fade-up">{children}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 rounded-md px-3 py-1">
      <Logo size={26} />
      <span className="font-display text-[22px] leading-none tracking-[-0.02em] text-text">Lighthouse</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col px-3 py-6 lg:flex">
        <div className="mb-3">{brand}</div>
        <div className="mb-7 px-3 text-[13px] text-faint">California telecom · Q3 portfolio</div>
        <Nav />
        <div className="mt-auto flex flex-col gap-3 px-3">
          <ApiStatus />
          <Link href="/" className="inline-flex items-center gap-1 text-[13px] text-faint transition-colors hover:text-text">
            About Lighthouse <ArrowUpRight size={13} />
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:border-l lg:border-line">
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-bg px-4 lg:hidden">
          {brand}
          <button onClick={() => setOpen(!open)} className="rounded-md p-1.5 text-muted hover:text-text" aria-label={open ? "Close menu" : "Open menu"}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        {open && <div className="border-b border-line bg-bg px-3 py-4 lg:hidden"><Nav /></div>}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-16 pt-8 md:px-8 lg:px-10">
          <PageFade>{children}</PageFade>
        </main>
      </div>
    </div>
  );
}
