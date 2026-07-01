"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LOGIN_URL, SIGNUP_URL } from "@/lib/links";

interface NavLink {
  href: string;
  label: string;
}

const navLinks: NavLink[] = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#why", label: "Why ZTS" },
];

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous && latest > 100) {
      setIsHidden(true);
    } else {
      setIsHidden(false);
    }
  });

  return (
    <motion.header
      animate={{ y: isHidden ? "-100%" : "0%" }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl backdrop-saturate-150"
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-8">
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

        <div className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/70 transition-colors duration-200 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-sm font-medium text-white/70 hover:bg-transparent hover:text-white"
          >
            <Link href={LOGIN_URL}>Log In</Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="rounded-full bg-white/10 px-5 text-sm font-medium text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20"
          >
            <Link href={SIGNUP_URL}>Get early access</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 md:hidden"
          aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? (
            <X className="h-5 w-5 text-white" />
          ) : (
            <Menu className="h-5 w-5 text-white" />
          )}
        </Button>
      </nav>

      <div
        id="mobile-menu"
        className={cn(
          "overflow-hidden bg-white/[0.02] backdrop-blur-2xl backdrop-saturate-150 transition-all duration-300 md:hidden",
          isMobileMenuOpen ? "max-h-[400px] border-b border-white/[0.08]" : "max-h-0"
        )}
      >
        <div className="flex flex-col gap-1 px-6 py-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full justify-center text-white/70 hover:bg-white/5 hover:text-white"
            >
              <Link href={LOGIN_URL} onClick={() => setIsMobileMenuOpen(false)}>
                Log In
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="w-full justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <Link href={SIGNUP_URL} onClick={() => setIsMobileMenuOpen(false)}>
                Get early access
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
