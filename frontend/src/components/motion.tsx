"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

import Counter from "./bits/Counter";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;
export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync. */
export function SmoothScroll() {
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4) });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => { gsap.ticker.remove(tick); lenis.destroy(); };
  }, []);
  return null;
}

/**
 * Staggered entrance for the direct children marked `[data-reveal]` (or all children).
 * Content is visible on the server render; the animation only starts once script runs.
 */
export function Reveal({ children, className, style, as: Tag = "div", stagger = 0.07, y = 24,
  delay = 0, scroll = true, once = true }: {
  children: ReactNode; className?: string; style?: CSSProperties; as?: "div" | "section" | "ul";
  stagger?: number; y?: number; delay?: number; scroll?: boolean; once?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useIso(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const marked = el.querySelectorAll<HTMLElement>("[data-reveal]");
    const targets = marked.length ? Array.from(marked) : Array.from(el.children);
    const ctx = gsap.context(() => {
      gsap.from(targets, {
        autoAlpha: 0, y, duration: 0.7, ease: "expo.out", stagger, delay,
        scrollTrigger: scroll ? { trigger: el, start: "top 94%", once } : undefined,
      });
    }, el);
    return () => ctx.revert();
  }, []);
  const Comp = Tag as "div";
  return <Comp ref={ref as React.RefObject<HTMLDivElement>} className={className} style={style}>{children}</Comp>;
}

/** Figures that roll into place like an odometer, and roll again whenever the value changes. */
export function Figure({ value, format, prefix, suffix, className, style }: {
  value: number | null | undefined; format?: Intl.NumberFormatOptions;
  prefix?: ReactNode; suffix?: ReactNode; className?: string; style?: CSSProperties;
}) {
  if (value == null || Number.isNaN(value)) return <span className={className}>—</span>;
  return (
    <Counter value={value} format={format} prefix={prefix} suffix={suffix} fontSize="1em"
      fontWeight="inherit" duration={0.9} bounce={0.12} stagger={0.035} fade={0.18}
      className={className} style={style} />
  );
}

export const fmt = {
  money: (v: number): Intl.NumberFormatOptions =>
    Math.abs(v) >= 10000
      ? { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 1 }
      : { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  pct: (digits = 1): Intl.NumberFormatOptions => ({ style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }),
  int: { maximumFractionDigits: 0 } as Intl.NumberFormatOptions,
  dec: (d: number): Intl.NumberFormatOptions => ({ minimumFractionDigits: d, maximumFractionDigits: d }),
};

/** Characters that resolve out of noise, for IDs and codes. */
export function Decrypt({ text, className, duration = 0.7 }: { text: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const fixed = Math.floor(p * text.length);
      el.textContent = text.split("").map((c, i) =>
        i < fixed || c === "-" || c === " " ? c : glyphs[(Math.random() * glyphs.length) | 0]).join("");
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);
  return <span ref={ref} className={className}>{text}</span>;
}
