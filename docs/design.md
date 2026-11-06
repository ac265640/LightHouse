# Lighthouse design

## Idea
On this site, the 7,043 customers' real California addresses become a night coastline, and the
lighthouse lamp is the only light in the room. Whatever the lamp touches is a customer worth
looking at.

## Two surfaces
- **Landing (`/`)** is a page to persuade. One dark field from top to bottom, lit things in it,
  slow pacing. The live element is the coastline: every dot is a real customer and the beam sweeps
  them, lighting risk as it passes. Hover any dot to read that customer.
- **Workspace (`/overview` and the rest)** is a tool to operate. The chrome holds no colour. The
  lamp hue goes on the one main data element of each screen; red and green appear only where a
  figure changed for the worse or the better.

## Tokens
| Role | Value | Use |
|---|---|---|
| ground | `#080B11` | page |
| surface | `#0E121A` | panels, one tone step up |
| raised | `#151A24` | hover, selected row, inputs |
| rule | `#1B2130` | table rules and panel edges (workspace only) |
| ink | `#ECEEF2` | running text |
| soft | `#A3AAB8` | secondary text |
| dim | `#7A8292` | meta, axis text |
| lamp | `#F5B547` | the one accent: primary action, main data element |
| bad / good | `#F2685C` / `#4FC48A` | change and state only |

## Type
- **Erode** (Fontshare) for display: the wordmark, headings, and every headline figure.
- **Geist** for the interface and running text, with tabular figures in tables.
- Workspace steps: 13 / 14 / 16 / 24 / 40. Landing steps: 17 / 26 / 36 / 64 / wordmark at 19vw.

## Motion
- Signature (landing): the beam sweeps the coastline; the wordmark scales a few percent as you scroll.
- Lenis smooth scrolling and GSAP ScrollTrigger entrances, staggered 70ms, rising 24px.
- Workspace: figures roll into place (odometer), panels catch a faint lamp light under the cursor,
  sections enter once. Everything has a `prefers-reduced-motion` fallback.

## House rules kept
No eyebrow labels over headings, no index numbering, no gradient buttons, no icons in tinted squares,
no glass navigation, no sparklines on KPIs. Two typefaces.
