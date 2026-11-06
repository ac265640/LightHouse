import Link from "next/link";

import { Logo } from "@/components/Logo";

export const metadata = {
  title: "Watch · Lighthouse",
  description: "The Lighthouse project film and a full product walkthrough.",
};

const VIDEOS = [
  {
    id: "film",
    title: "The project film",
    length: "1 min 30 s",
    text: "The problem, the leakage trap, the models, survival lifetime value, the causal twist on offers, the money, and the product.",
    src: "/videos/lighthouse-film.mp4",
    poster: "/videos/lighthouse-film.jpg",
  },
  {
    id: "demo",
    title: "The product walkthrough",
    length: "2 min 35 s",
    text: "Every page of the live app: the customer map, profiles, the what-if simulator, AI emails, campaigns, the copilot and the model lab.",
    src: "/videos/lighthouse-demo.mp4",
    poster: "/videos/lighthouse-demo.jpg",
  },
];

export default function Watch() {
  return (
    <main className="min-h-screen bg-bg px-[max(20px,env(safe-area-inset-left))] pb-24 pt-8 text-text md:px-8">
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="font-display text-[22px] tracking-[-0.02em]">Lighthouse</span>
        </Link>
        <Link href="/overview" className="text-[15px] text-text underline decoration-lamp decoration-2 underline-offset-[6px] hover:text-lamp">
          Open the workspace
        </Link>
      </nav>

      <header className="mx-auto mt-16 max-w-[1240px]">
        <h1 className="font-display text-[clamp(40px,5vw,72px)] font-normal leading-[1.02] tracking-[-0.02em]">Watch Lighthouse</h1>
        <p className="mt-4 max-w-[52ch] text-[18px] leading-relaxed text-muted">
          Two videos: a short film on why it works, and a walkthrough of every page of the live product.
        </p>
      </header>

      <div className="mx-auto mt-14 flex max-w-[1240px] flex-col gap-20">
        {VIDEOS.map((v) => (
          <section key={v.id} id={v.id} aria-labelledby={`${v.id}-h`} className="scroll-mt-8">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 id={`${v.id}-h`} className="font-display text-[34px] font-normal tracking-[-0.02em]">{v.title}</h2>
              <span className="text-[15px] text-faint">{v.length}</span>
            </div>
            <video className="aspect-video w-full rounded-lg bg-panel" controls preload="metadata" playsInline poster={v.poster}>
              <source src={v.src} type="video/mp4" />
            </video>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
              <p className="max-w-[70ch] text-[16px] leading-relaxed text-muted">{v.text}</p>
              <a href={v.src} className="text-[15px] text-muted underline-offset-4 hover:text-text hover:underline">Open the video file</a>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
