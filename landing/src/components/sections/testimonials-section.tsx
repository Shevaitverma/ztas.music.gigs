"use client";

// Repurposed from a "testimonials" section. We're pre-launch, so there are no
// real customers to quote yet — fabricated reviews would be deceptive. Instead
// this section honestly explains what we're building and invites early users.
// (Component name kept to avoid churn in the page composition.)

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { MapPin, Music2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SIGNUP_URL } from "@/lib/links";

interface Reason {
  icon: React.ReactNode;
  title: string;
  content: string;
}

const reasons: Reason[] = [
  {
    icon: <MapPin className="h-5 w-5" />,
    title: "Built for India",
    content:
      "INR pricing, local genres, and a city-first rollout. We're starting in Mumbai and onboarding artists and organisers from there.",
  },
  {
    icon: <Music2 className="h-5 w-5" />,
    title: "A fair deal for artists",
    content:
      "Set your own rate, keep your profile, and get discovered for gigs that fit you — no agents, no cold calls, no monthly fee.",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Confidence for organisers",
    content:
      "Compare real proposals before you commit. Escrow and OTP check-in are on the way, so payment will only release once the gig actually happens.",
  },
];

function SpotlightCard({
  reason,
  index,
  isVisible,
  mousePosition,
  containerRect,
}: {
  reason: Reason;
  index: number;
  isVisible: boolean;
  mousePosition: { x: number; y: number };
  containerRect: DOMRect | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [localMouse, setLocalMouse] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (!cardRef.current || !containerRect) return;

    const cardRect = cardRef.current.getBoundingClientRect();
    const relativeX = mousePosition.x - (cardRect.left - containerRect.left);
    const relativeY = mousePosition.y - (cardRect.top - containerRect.top);

    setLocalMouse({ x: relativeX, y: relativeY });

    const isNear = relativeX >= -100 && relativeX <= cardRect.width + 100 &&
                   relativeY >= -100 && relativeY <= cardRect.height + 100;
    setIsHovering(isNear);
  }, [mousePosition, containerRect]);

  return (
    <div
      ref={cardRef}
      data-index={index}
      className="group relative rounded-2xl p-[1px]"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      {/* Spotlight overlay for border */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${localMouse.x}px ${localMouse.y}px, rgba(139, 92, 246, 0.2), transparent 40%)`,
          opacity: isHovering ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
      <div
        className="relative h-full rounded-2xl border border-white/[0.06] p-6 overflow-hidden"
        style={{ background: "rgba(12, 5, 21, 1)" }}
      >
        {/* Spotlight overlay for inner glow */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: `radial-gradient(600px circle at ${localMouse.x}px ${localMouse.y}px, rgba(139, 92, 246, 0.08), transparent 40%)`,
            opacity: isHovering ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
        {/* Icon */}
        <div className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400 ring-1 ring-white/10">
          {reason.icon}
        </div>

        {/* Content */}
        <h3 className="relative mt-4 text-base font-semibold text-white">
          {reason.title}
        </h3>
        <p className="relative mt-2 text-sm leading-relaxed text-white/70">
          {reason.content}
        </p>
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  const [visibleCards, setVisibleCards] = useState<boolean[]>(new Array(reasons.length).fill(false));
  const [headerVisible, setHeaderVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = entry.target.getAttribute("data-index");
            if (index === "header") {
              setHeaderVisible(true);
            } else {
              const idx = Number(index);
              setTimeout(() => {
                setVisibleCards((prev) => {
                  const next = [...prev];
                  next[idx] = true;
                  return next;
                });
              }, idx * 80);
            }
          }
        });
      },
      { threshold: 0.15 }
    );

    const elements = sectionRef.current?.querySelectorAll("[data-index]");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setContainerRect(rect);
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  return (
    <section ref={sectionRef} id="why" className="relative py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0c0515]" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 50% 40% at 90% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
              radial-gradient(ellipse 40% 30% at 10% 20%, rgba(236, 72, 153, 0.08) 0%, transparent 50%)
            `,
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div
          data-index="header"
          className="mx-auto max-w-2xl text-center"
          style={{
            opacity: headerVisible ? 1 : 0,
            transform: headerVisible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 mb-4">
            <span className="text-xs text-purple-300">Why ZTS Gigs</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Be among the{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              first
            </span>
          </h2>
          <p className="mt-4 text-base text-white/60">
            We&rsquo;re a new, India-first marketplace for live music. We don&rsquo;t have a
            wall of reviews yet — what we have is a clear idea of how booking
            should work, and room for early users to shape it.
          </p>
        </div>

        {/* Reasons Grid */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {reasons.map((reason, index) => (
            <SpotlightCard
              key={reason.title}
              reason={reason}
              index={index}
              isVisible={visibleCards[index]}
              mousePosition={mousePosition}
              containerRect={containerRect}
            />
          ))}
        </div>

        {/* Early-access nudge */}
        <div className="mt-12 text-center">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 text-white hover:brightness-110"
          >
            <Link href={SIGNUP_URL}>Get early access</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
