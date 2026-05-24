"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function CtaSection() {
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0c0515]" />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(30px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-purple-700 to-pink-600" />

          {/* Animated glow orbs */}
          <div className="absolute -left-20 -top-20 h-60 w-60 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-pink-500/20 blur-3xl" />

          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />

          {/* Content */}
          <div className="relative px-8 py-16 text-center sm:px-16 sm:py-20">
            <div
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white/90 backdrop-blur-sm mb-6"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "scale(1)" : "scale(0.9)",
                transition: "opacity 0.5s ease 0.2s, transform 0.5s ease 0.2s",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              Free to Post Gigs - No Hidden Fees
            </div>

            <h2
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(20px)",
                transition: "opacity 0.5s ease 0.3s, transform 0.5s ease 0.3s",
              }}
            >
              Ready to Book Amazing
              <br />
              Live Music?
            </h2>

            <p
              className="mx-auto mt-4 max-w-xl text-base text-white/70"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(20px)",
                transition: "opacity 0.5s ease 0.4s, transform 0.5s ease 0.4s",
              }}
            >
              Join thousands of venues and artists already using ZTS Music to
              connect, book, and perform unforgettable live shows.
            </p>

            <div
              className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(20px)",
                transition: "opacity 0.5s ease 0.5s, transform 0.5s ease 0.5s",
              }}
            >
              <Link href="https://app.ztsmusic.com/gigs/new">
                <Button
                  size="lg"
                  className="group h-12 bg-white text-purple-700 hover:bg-white/90 font-semibold px-6"
                >
                  Post a Gig
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="https://app.ztsmusic.com">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 border-white/20 bg-white/5 text-white hover:bg-white/10 px-6"
                >
                  Browse Artists
                </Button>
              </Link>
            </div>

            <p
              className="mt-6 text-xs text-white/50"
              style={{
                opacity: visible ? 1 : 0,
                transition: "opacity 0.5s ease 0.6s",
              }}
            >
              No credit card required • Free to get started • Book in minutes
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
