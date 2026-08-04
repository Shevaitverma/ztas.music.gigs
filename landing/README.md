# ZTS Gigs Landing Page 
A modern landing page for India's premier live music gig marketplace, built with Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, and Framer Motion.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy env template
cp .env.example .env.local

# Run dev server (pass --port; all three Next apps default to :3000)
pnpm dev --port 3002

# Build for production
pnpm build
```

Env keys that matter: `NEXT_PUBLIC_APP_URL` (every conversion CTA points here —
defaults to `https://gigs.ztas.in`) and `NEXT_PUBLIC_SITE_URL` (canonical URL for
SEO metadata + sitemap). See `.env.example`.

This site is static marketing — it does not require the backend to run.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm start` | Run production build |
| `pnpm lint` | Run ESLint |

## Project Structure

```
src/
├── app/
│   ├── layout.tsx        # Root layout + metadata
│   ├── page.tsx          # Landing page
│   ├── globals.css       # Global styles + Tailwind
│   ├── sitemap.ts        # Dynamic sitemap
│   ├── robots.ts         # robots.txt
│   ├── terms/            # Canonical /terms page
│   └── privacy/          # Canonical /privacy page
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── layout/           # Navbar, Footer, legal-page shell
│   └── sections/         # Hero, Features, Pricing, etc.
└── lib/
    └── utils.ts          # Utility functions
```

The web app links to `/terms` and `/privacy` here via `NEXT_PUBLIC_LANDING_URL` —
this site owns the canonical copies.

## Sections

Six section components in `src/components/sections/`:

- Hero with CTA
- Features overview
- How it works
- Pricing
- Testimonials
- Closing CTA

Plus Navbar and Footer in `src/components/layout/`.

> There is **no FAQ section** — an earlier revision of this README listed one
> that was never built. Don't go looking for `faq-section.tsx`.

## Claims made on this page

The page describes escrow, OTP-based payment release and the commission as
**planned / "coming soon" / "rolling out during the beta"**, and that wording is
load-bearing: none of it exists in the backend today. There is no payments code,
no `Transaction` model, and no gateway integration anywhere in the platform. If
you edit the pricing, how-it-works or trust copy, keep the forward-looking
framing until those features actually ship — see `PROJECT_CONTEXT.md` at the
repo root.

## Tech Stack

- Next.js 16 (App Router) — `16.1.4` at time of writing
- Tailwind CSS 4
- Framer Motion
- shadcn/ui
