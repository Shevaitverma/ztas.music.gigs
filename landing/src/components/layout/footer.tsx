import Link from "next/link";
import { APP_URL, SIGNUP_URL } from "@/lib/links";

interface FooterLink {
  href: string;
  label: string;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const footerSections: FooterSection[] = [
  {
    title: "Explore",
    links: [
      { href: "#features", label: "Features" },
      { href: "#how-it-works", label: "How it Works" },
      { href: "#pricing", label: "Pricing" },
      { href: "#why", label: "Why ZTS" },
    ],
  },
  {
    title: "For Artists",
    links: [
      { href: SIGNUP_URL, label: "Find Gigs" },
      { href: SIGNUP_URL, label: "Get Early Access" },
    ],
  },
  {
    title: "For Organisers",
    links: [
      { href: SIGNUP_URL, label: "Post a Gig" },
      { href: APP_URL, label: "Explore the App" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] bg-[#0c0515]">
      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-6">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-6 w-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="2" y="2" width="8" height="8" rx="1.5" className="fill-white/90" />
                  <rect x="14" y="2" width="8" height="8" rx="1.5" className="fill-white/90" />
                  <rect x="2" y="14" width="8" height="8" rx="1.5" className="fill-white/90" />
                  <rect x="14" y="14" width="8" height="8" rx="1.5" className="fill-white/40" />
                </svg>
              </div>
              <span className="text-lg font-semibold tracking-tight text-white">
                ZTS Gigs
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              An early-access marketplace connecting artists with event organisers
              across India. Book live music, simplified.
            </p>
          </div>

          {/* Links */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">
                {section.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/60 transition-colors duration-200 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-12 border-t border-white/[0.06] pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-white/50">
              © {new Date().getFullYear()} ZTS Gigs. All rights reserved.
            </p>
            <p className="text-xs text-white/50">
              Early access · Now onboarding in India
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
