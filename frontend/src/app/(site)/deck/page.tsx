import Link from "next/link";

import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Pitch deck · Lighthouse",
  description: "The Lighthouse pitch deck by Team Tiramisu Tensor for DataNova 2026.",
};

const PDF = "/deck/Lighthouse-Team-Tiramisu-Tensor.pdf";
const PPTX = "/deck/Lighthouse-Team-Tiramisu-Tensor.pptx";

export default function Deck() {
  return (
    <main className="min-h-screen bg-bg px-[max(20px,env(safe-area-inset-left))] pb-20 pt-8 text-text md:px-8">
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="font-display text-[22px] tracking-[-0.02em]">Lighthouse</span>
        </Link>
        <div className="flex items-center gap-6 text-[15px]">
          <Link href="/watch" className="text-muted hover:text-text">Videos</Link>
          <Link href="/overview" className="text-text underline decoration-lamp decoration-2 underline-offset-[6px] hover:text-lamp">Open the workspace</Link>
        </div>
      </nav>

      <header className="mx-auto mt-14 flex max-w-[1240px] flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[clamp(40px,5vw,68px)] font-normal leading-[1.02] tracking-[-0.02em]">The pitch deck</h1>
          <p className="mt-4 max-w-[56ch] text-[18px] leading-relaxed text-muted">
            Fifteen slides by Team Tiramisu Tensor: the problem we chose, our solution step by step, the results, the product, and how it runs in a real company.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={PPTX} download className="inline-flex h-11 items-center bg-lamp px-5 text-[15px] font-medium text-[var(--lamp-ink)] hover:brightness-110">
            Download PowerPoint
          </a>
          <a href={PDF} className="inline-flex h-11 items-center bg-panel-2 px-5 text-[15px] text-text hover:bg-panel">
            Open as PDF
          </a>
        </div>
      </header>

      <div className="mx-auto mt-10 max-w-[1240px]">
        <object data={PDF} type="application/pdf" className="aspect-[16/10] w-full rounded-lg bg-panel" aria-label="Lighthouse pitch deck">
          <a href={PDF} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/deck/cover.jpg" alt="Lighthouse pitch deck cover. Select to open the PDF." className="w-full rounded-lg" />
          </a>
        </object>
        <p className="mt-4 text-[15px] text-faint">
          If the slides don&apos;t show here, <a href={PDF} className="text-muted underline underline-offset-4 hover:text-text">open the PDF</a> or download the PowerPoint above.
        </p>
      </div>
    </main>
  );
}
