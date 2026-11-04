"use client";

import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

import Noise from "@/components/bits/Noise";
import { Board, Close, Cost, Figures, Hero, Methods, Questions, Reversal, useLandingData } from "@/components/landing";
import { SmoothScroll } from "@/components/motion";

export default function Landing() {
  const { map, summary, offers } = useLandingData();
  // Sections mount as data arrives; re-measure every scroll trigger once the layout settles.
  useEffect(() => {
    const t = setTimeout(() => ScrollTrigger.refresh(), 120);
    return () => clearTimeout(t);
  }, [map, summary, offers.length]);
  return (
    <main className="relative overflow-x-clip bg-bg text-text">
      <SmoothScroll />
      <Noise fixed opacity={0.035} fps={12} zIndex={60} />
      <Hero map={map} summary={summary} />
      <Cost s={summary} />
      <Questions s={summary} />
      {summary && <Board rows={summary.top_at_risk} />}
      {offers.length > 0 && <Reversal offers={offers} />}
      <Methods />
      <Figures />
      <Close />
    </main>
  );
}
