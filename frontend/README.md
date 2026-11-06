# Lighthouse web app

The analyst workspace and landing page for Lighthouse, built with Next.js 15, React 19, TypeScript and Tailwind CSS 4.

## Run locally

Start the API first (see the [main README](../README.md#getting-started)), then:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Address of the Lighthouse API |
| `NEXT_PUBLIC_SNAPSHOT` | unset | Set to `1` to read data from `public/snapshot/` (hosted mode) |

## Structure

```text
src/
├── app/
│   ├── (site)/page.tsx        Landing page
│   ├── (app)/layout.tsx       Workspace shell (sidebar and navigation)
│   ├── (app)/overview/        Portfolio overview with the customer map
│   ├── (app)/customers/       Customer list and customer profile
│   ├── (app)/campaign/        Budget optimiser, offer evidence and A/B sizing
│   ├── (app)/playbook/        Retention plays
│   ├── (app)/copilot/         Gemini copilot
│   ├── (app)/model/           Validation, calibration, survival and fairness
│   ├── (app)/monitoring/      Drift and batch scoring
│   └── globals.css            Design tokens
├── components/
│   ├── Shell.tsx              Sidebar, navigation and live-model status
│   ├── ui.tsx                 Cards, stats, badges, segmented controls
│   ├── motion.tsx             Smooth scroll, reveals, rolling figures
│   ├── Coastline.tsx          Canvas map of every customer with the sweeping lamp
│   ├── landing.tsx            Landing page sections
│   └── bits/                  Animated components adapted from React Bits
└── lib/
    ├── api.ts                 API client, with the static-snapshot mode for hosting
    ├── useApi.ts              Data-fetching hook
    └── format.ts              Number, money and colour helpers
```

The visual system (colours, type and motion) is described in [docs/design.md](../docs/design.md).

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```
