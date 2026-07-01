"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SIGNUP_URL } from "@/lib/links";

interface PricingPlan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  note?: string;
  isPopular?: boolean;
  buttonText: string;
  href: string;
}

// No subscriptions. The platform is free to join; we earn a commission only
// when a booking completes. Escrow + OTP-based release roll out during the beta.
const plans: PricingPlan[] = [
  {
    name: "Free to Join",
    price: "₹0",
    period: "/forever",
    description: "For every artist and organiser. No subscription, no upfront cost.",
    features: [
      "Post unlimited gigs",
      "Browse and contact artists",
      "Send quotes and proposals",
      "Direct messaging",
    ],
    buttonText: "Get early access",
    href: SIGNUP_URL,
  },
  {
    name: "Pay When You Book",
    price: "~10–12%",
    period: "per completed booking",
    description:
      "No monthly fees. We earn a small platform commission only when a booking actually completes.",
    features: [
      "No upfront or monthly cost",
      "Fee only on completed bookings",
      "Payment held in escrow",
      "Released after OTP check-in",
    ],
    note: "Escrow and OTP-based release roll out during the beta.",
    isPopular: true,
    buttonText: "Get early access",
    href: SIGNUP_URL,
  },
  {
    name: "Early Access",
    price: "Beta",
    period: "",
    description:
      "We're onboarding our first artists and organisers in India right now. Join early to help shape what we build.",
    features: [
      "Founding-member access",
      "A direct line to the team",
      "First to try new features",
      "Help set fair, transparent pricing",
    ],
    buttonText: "Join the beta",
    href: SIGNUP_URL,
  },
];

function SpotlightCard({
  plan,
  index,
  isVisible,
  mousePosition,
  containerRect,
}: {
  plan: PricingPlan;
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

  const glowColor = plan.isPopular
    ? "rgba(168, 85, 247, 0.25)"
    : "rgba(139, 92, 246, 0.2)";
  const innerGlowColor = plan.isPopular
    ? "rgba(168, 85, 247, 0.12)"
    : "rgba(139, 92, 246, 0.08)";

  // Base background for popular card (always visible)
  const popularBorderGradient = "linear-gradient(to bottom, rgba(168, 85, 247, 0.3), rgba(168, 85, 247, 0.1))";
  const popularInnerGradient = "linear-gradient(to bottom, rgba(168, 85, 247, 0.08), rgba(12, 5, 21, 1))";

  return (
    <div
      ref={cardRef}
      data-index={index}
      className="group relative rounded-2xl p-[1px]"
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
        background: plan.isPopular ? popularBorderGradient : "transparent",
      }}
    >
      {/* Spotlight overlay for border - fades in/out smoothly */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${localMouse.x}px ${localMouse.y}px, ${glowColor}, transparent 40%)`,
          opacity: isHovering ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
      <div
        className="relative h-full rounded-2xl border border-white/[0.06] p-6 overflow-hidden"
        style={{
          background: plan.isPopular ? popularInnerGradient : "rgba(12, 5, 21, 1)",
        }}
      >
        {/* Spotlight overlay for inner glow - fades in/out smoothly */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: `radial-gradient(600px circle at ${localMouse.x}px ${localMouse.y}px, ${innerGlowColor}, transparent 40%)`,
            opacity: isHovering ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
        {/* Popular badge */}
        {plan.isPopular && (
          <div className="absolute -right-10 top-5 rotate-45 bg-gradient-to-r from-purple-500 to-pink-500 px-10 py-1 text-[10px] font-semibold text-white">
            Popular
          </div>
        )}

        {/* Plan header */}
        <div>
          <h3 className="text-base font-semibold text-white">
            {plan.name}
          </h3>
          <div className="mt-3 flex items-baseline">
            <span className="text-3xl font-bold text-white">
              {plan.price}
            </span>
            <span className="ml-1 text-sm text-white/40">
              {plan.period}
            </span>
          </div>
          <p className="mt-3 text-sm text-white/40 leading-relaxed">
            {plan.description}
          </p>
        </div>

        {/* Features */}
        <ul className="mt-6 space-y-3">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                <Check className="h-2.5 w-2.5 text-purple-400" />
              </div>
              <span className="text-sm text-white/70">
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* Note */}
        {plan.note && (
          <p className="relative mt-4 text-xs italic text-white/50">
            {plan.note}
          </p>
        )}

        {/* CTA */}
        <Button
          asChild
          className={`mt-6 w-full ${
            plan.isPopular
              ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90"
              : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
          }`}
        >
          <Link href={plan.href}>{plan.buttonText}</Link>
        </Button>
      </div>
    </div>
  );
}

export function PricingSection() {
  const [visibleCards, setVisibleCards] = useState<boolean[]>(new Array(plans.length).fill(false));
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
              }, idx * 150);
            }
          }
        });
      },
      { threshold: 0.2 }
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
    <section ref={sectionRef} id="pricing" className="relative py-24 sm:py-32">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0c0515]" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 50% 0%, rgba(139, 92, 246, 0.12) 0%, transparent 50%)
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
            <span className="text-xs text-purple-300">Pricing</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Simple,{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Transparent
            </span>{" "}
            Pricing
          </h2>
          <p className="mt-4 text-base text-white/60">
            Free to join — no subscriptions. We only earn a small commission when
            you complete a booking. You&rsquo;ll always see the fee upfront.
          </p>
        </div>

        {/* Pricing Cards */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="mt-16 grid gap-6 lg:grid-cols-3"
        >
          {plans.map((plan, index) => (
            <SpotlightCard
              key={plan.name}
              plan={plan}
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
