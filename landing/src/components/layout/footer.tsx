import Link from "next/link";

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
    title: "For Artists",
    links: [
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "#how-it-works", label: "How it Works" },
    ],
  },
  {
    title: "For Venues",
    links: [
      { href: "#testimonials", label: "About" },
      { href: "#", label: "Blog" },
      { href: "#", label: "Careers" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "#", label: "Help Center" },
      { href: "#", label: "Contact" },
      { href: "#", label: "Community" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#", label: "Privacy" },
      { href: "#", label: "Terms" },
      { href: "#", label: "Cookies" },
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
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/40">
              The platform connecting talented artists with venues and event organizers.
              Book live music, simplified.
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
                      className="text-sm text-white/40 transition-colors duration-200 hover:text-white/70"
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
            <p className="text-xs text-white/30">
              © {new Date().getFullYear()} ZTS Music. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link
                href="#"
                className="text-xs text-white/30 transition-colors duration-200 hover:text-white/60"
              >
                Instagram
              </Link>
              <Link
                href="#"
                className="text-xs text-white/30 transition-colors duration-200 hover:text-white/60"
              >
                Instagram
              </Link>
              <Link
                href="#"
                className="text-xs text-white/30 transition-colors duration-200 hover:text-white/60"
              >
                LinkedIn
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
