"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { money, pct } from "@/lib/format";
import { reducedMotion } from "./motion";

export type MapData = {
  fields: string[];
  priorities: string[];
  points: [string, number, number, number, number, number, number][];
};

type P = { id: string; x: number; y: number; risk: number; clv: number; pri: number; gone: boolean };

const COLORS = {
  sea: [62, 74, 98],
  gone: [70, 76, 90],
  steel: [190, 202, 220],
  lamp: [245, 181, 71],
  bad: [242, 104, 92],
};

const tint = (risk: number) => (risk >= 0.5 ? COLORS.bad : risk >= 0.2 ? COLORS.lamp : COLORS.steel);

/**
 * Every customer at their real California location. A lamp off the coast sweeps the field;
 * what the beam touches lights up in the colour of its churn risk. Point at the map to aim the beam,
 * hover a customer to read them, click to open their profile.
 */
export function Coastline({ data, orient = "true", sweep = true, className, showChurned = true, onLit }: {
  data: MapData; orient?: "true" | "horizontal"; sweep?: boolean; className?: string;
  showChurned?: boolean; onLit?: (n: { atRisk: number; value: number }) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [hover, setHover] = useState<{ p: P; x: number; y: number } | null>(null);
  const hoverRef = useRef<P | null>(null);
  const onLitRef = useRef(onLit);
  onLitRef.current = onLit;

  // Project lat/lng once; optionally rotate so the coast runs along the frame's long side.
  const base = useMemo(() => {
    const k = Math.cos((37 * Math.PI) / 180);
    let pts = data.points.map(([id, lat, lng, risk, clv, pri, gone]) =>
      ({ id, x: lng * k, y: -lat, risk, clv, pri, gone: gone === 1 }));
    if (!showChurned) pts = pts.filter((p) => !p.gone);
    if (orient === "horizontal") {
      // Rotate by the principal axis so the coast lies along the frame, ocean side down.
      const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      const c = Math.cos(-theta), s = Math.sin(-theta);
      pts = pts.map((p) => ({ ...p, x: (p.x - mx) * c - (p.y - my) * s, y: (p.x - mx) * s + (p.y - my) * c }));
      // North (Oregon border) on the left; inland up, the Pacific below.
      const north = pts.reduce((a, p) => (p.y < a.y ? p : a), pts[0]);
      if (north.x > 0) pts = pts.map((p) => ({ ...p, x: -p.x }));
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    // Seeded jitter so customers who share a ZIP centroid spread into a small cluster.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
    return { pts: pts.map((p) => ({ ...p, jx: rnd(), jy: rnd() })), minX, maxX, minY, maxY };
  }, [data, orient, showChurned]);

  useEffect(() => {
    const el = canvas.current, box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext("2d")!;
    const still = reducedMotion() || !sweep;
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true;
    let screen: (P & { sx: number; sy: number })[] = [];
    let lamp = { x: 0, y: 0 };
    let angle = -2.2, target: number | null = null, lastLit = 0;

    const layout = () => {
      const r = box.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      el.width = w * dpr; el.height = h * dpr;
      el.style.width = `${w}px`; el.style.height = `${h}px`;
      const pad = Math.min(w, h) * 0.08;
      const sx = (w - pad * 2) / (base.maxX - base.minX), sy = (h - pad * 2) / (base.maxY - base.minY);
      const s = Math.min(sx, sy);
      const ox = (w - (base.maxX - base.minX) * s) / 2, oy = (h - (base.maxY - base.minY) * s) / 2;
      const spread = Math.max(1.5, s * 0.035);
      screen = base.pts.map((p) => ({
        ...p, sx: ox + (p.x - base.minX) * s + p.jx * spread * 2, sy: oy + (p.y - base.minY) * s + p.jy * spread * 2,
      }));
      // The lamp stands offshore, west of the middle of the coast.
      const mid = screen.reduce((a, p) => ({ x: a.x + p.sx, y: a.y + p.sy }), { x: 0, y: 0 });
      const cx = mid.x / screen.length, cy = mid.y / screen.length;
      lamp = orient === "horizontal" ? { x: cx, y: Math.min(h - 18, cy + h * 0.42) } : { x: Math.max(16, cx - w * 0.2), y: Math.min(h - 16, cy + h * 0.16) };
    };

    const draw = (t: number) => {
      raf = 0;
      if (!visible) return;
      if (!still) {
        if (target != null) {
          let d = target - angle;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          angle += d * 0.12;
        } else angle += 0.0045;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // The beam: a soft wedge of lamp light from the tower.
      const spread = 0.3, reach = Math.hypot(w, h);
      const g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, reach);
      g.addColorStop(0, "rgba(245,181,71,0.16)");
      g.addColorStop(0.55, "rgba(245,181,71,0.04)");
      g.addColorStop(1, "rgba(245,181,71,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lamp.x, lamp.y);
      ctx.arc(lamp.x, lamp.y, reach, angle - spread, angle + spread);
      ctx.closePath();
      ctx.fill();

      let atRisk = 0, value = 0;
      const size = w > 700 ? 2.2 : 1.8;
      for (const p of screen) {
        let d = Math.atan2(p.sy - lamp.y, p.sx - lamp.x) - angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const lit = still ? 0.35 + p.risk * 0.65 : Math.max(0, 1 - Math.abs(d) / spread) ** 1.6;
        let c = COLORS.sea, a = 0.62;
        if (p.gone) { c = COLORS.gone; a = 0.22 + lit * 0.2; }
        else if (lit > 0.02) {
          const hot = tint(p.risk);
          const m = Math.min(1, lit * (0.55 + p.risk));
          c = [COLORS.sea[0] + (hot[0] - COLORS.sea[0]) * m, COLORS.sea[1] + (hot[1] - COLORS.sea[1]) * m, COLORS.sea[2] + (hot[2] - COLORS.sea[2]) * m];
          a = 0.62 + m * 0.38;
          if (lit > 0.25 && p.risk >= 0.5) { atRisk++; value += p.risk * p.clv; }
        }
        ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
        const big = !p.gone && lit > 0.5 && p.risk >= 0.5 ? size + 0.8 : size;
        ctx.fillRect(p.sx - big / 2, p.sy - big / 2, big, big);
      }

      const hp = hoverRef.current;
      if (hp) {
        const q = screen.find((s) => s.id === hp.id);
        if (q) {
          ctx.strokeStyle = "rgba(236,238,242,0.9)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(q.sx, q.sy, 6, 0, Math.PI * 2); ctx.stroke();
        }
      }

      // The tower itself.
      ctx.fillStyle = "#f5b547";
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(245,181,71,0.18)";
      ctx.beginPath(); ctx.arc(lamp.x, lamp.y, 9 + Math.sin(t / 600) * 1.5, 0, Math.PI * 2); ctx.fill();

      if (onLitRef.current && t - lastLit > 250) { lastLit = t; onLitRef.current({ atRisk, value }); }
      if (!still) raf = requestAnimationFrame(draw);
    };

    const kick = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      target = Math.atan2(y - lamp.y, x - lamp.x);
      let best: (typeof screen)[number] | null = null, bd = 100;
      for (const p of screen) {
        if (p.gone) continue;
        const d = (p.sx - x) ** 2 + (p.sy - y) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      hoverRef.current = best;
      setHover(best ? { p: best, x: best.sx, y: best.sy } : null);
      if (still) kick();
    };
    const onLeave = () => { target = null; hoverRef.current = null; setHover(null); if (still) kick(); };
    const onClick = () => { if (hoverRef.current) router.push(`/customers/${hoverRef.current.id}`); };

    layout();
    kick();
    const ro = new ResizeObserver(() => { layout(); kick(); });
    ro.observe(box);
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); });
    io.observe(box);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
    };
  }, [base, orient, sweep, router]);

  return (
    <div ref={wrap} className={className?.includes("absolute") ? className : `relative ${className ?? ""}`}>
      <canvas ref={canvas} className={hover ? "cursor-pointer" : "cursor-crosshair"}
        role="img" aria-label={`Map of ${data.points.length.toLocaleString()} customers across California, coloured by churn risk`} />
      {hover && (
        <div className="pointer-events-none absolute z-10 w-56 rounded-md bg-panel-2 px-3 py-2.5 text-[13px] shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          style={{ left: Math.min(hover.x + 14, (wrap.current?.clientWidth ?? 0) - 236), top: Math.max(4, hover.y - 70) }}>
          <div className="num font-medium text-text">{hover.p.id}</div>
          <div className="mt-1 flex justify-between text-muted"><span>Churn risk</span>
            <span className="num" style={{ color: hover.p.risk >= 0.5 ? "var(--bad)" : hover.p.risk >= 0.2 ? "var(--lamp)" : "var(--ink)" }}>{pct(hover.p.risk, 0)}</span></div>
          <div className="flex justify-between text-muted"><span>Worth if kept</span><span className="num text-text">{money(hover.p.clv)}</span></div>
          <div className="flex justify-between text-muted"><span>Priority</span><span className="text-text">{data.priorities[hover.p.pri]}</span></div>
        </div>
      )}
    </div>
  );
}
