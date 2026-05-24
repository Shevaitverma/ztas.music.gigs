# ZTS Gigs Landing Page 
A modern landing page for India's premier live music gig marketplace, built with Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, and Framer Motion.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Build for production
pnpm build
```

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
│   └── sitemap.ts        # Dynamic sitemap
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── layout/           # Navbar, Footer
│   └── sections/         # Hero, Features, Pricing, etc.
└── lib/
    └── utils.ts          # Utility functions
```

## Sections

- Hero with CTA
- Features overview
- How it works
- Pricing plans
- Testimonials
- FAQ
- Footer with links

## Tech Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- Framer Motion
- shadcn/ui
