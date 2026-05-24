"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Wand2,
  Users,
  Globe,
  Zap,
  Shield,
  BarChart3,
} from "lucide-react";

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <Wand2 className="h-5 w-5" />,
    title: "Smart Matching",
    description:
      "Our algorithm matches your gig with the perfect artists based on genre, budget, and availability.",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Verified Artists",
    description:
      "Browse profiles with verified reviews, sample performances, and professional credentials.",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "City-Wide Reach",
    description:
      "Connect with talented musicians across 50+ cities. Find local artists or discover nearby talent.",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Instant Booking",
    description:
      "Review applications, chat with artists, and confirm bookings in minutes, not days.",
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: "Secure Payments",
    description:
      "Protected transactions with escrow-style payments. Artists get paid, venues get peace of mind.",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Gig Management",
    description:
      "Track applications, manage multiple gigs, and review past bookings from one dashboard.",
  },
];

function SpotlightCard({
  feature,
  index,
  isVisible,
  mousePosition,
  containerRect,
}: {
  feature: Feature;
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

    // Check if mouse is within reasonable distance of card
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
          {feature.icon}
        </div>

        {/* Content */}
        <h3 className="relative mt-4 text-base font-semibold text-white">
          {feature.title}
        </h3>
        <p className="relative mt-2 text-sm leading-relaxed text-white/40">
          {feature.description}
        </p>
      </div>
    </div>
  );
}

export function FeaturesSection() {
  const [visibleCards, setVisibleCards] = useState<boolean[]>(new Array(features.length).fill(false));
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute("data-index"));
            setTimeout(() => {
              setVisibleCards((prev) => {
                const next = [...prev];
                next[index] = true;
                return next;
              });
            }, index * 100);
          }
        });
      },
      { threshold: 0.2 }
    );

    const cards = sectionRef.current?.querySelectorAll("[data-index]");
    cards?.forEach((card) => observer.observe(card));

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
    <section ref={sectionRef} id="features" className="relative py-24 sm:py-32">
      {/* Background - matches hero */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0c0515]" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 60% 40% at 70% 20%, rgba(120, 80, 180, 0.08) 0%, transparent 50%),
              radial-gradient(ellipse 50% 50% at 20% 80%, rgba(100, 60, 160, 0.06) 0%, transparent 50%)
            `,
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1 mb-4">
            <span className="text-xs text-purple-300">Platform Features</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything You Need to{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Book & Perform
            </span>
          </h2>
          <p className="mt-4 text-base text-white/50">
            Powerful tools designed to connect venues with talented artists
            and make live music booking effortless.
          </p>
        </div>

        {/* Features Grid */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 relative"
        >
          {features.map((feature, index) => (
            <SpotlightCard
              key={feature.title}
              feature={feature}
              index={index}
              isVisible={visibleCards[index]}
              mousePosition={mousePosition}
              containerRect={containerRect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
