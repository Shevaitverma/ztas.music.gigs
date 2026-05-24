"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { Star, Quote } from "lucide-react";

interface Testimonial {
  name: string;
  role: string;
  avatar: string;
  content: string;
}

const testimonials: Testimonial[] = [
  {
    name: "Priya Sharma",
    role: "Venue Owner, Mumbai",
    avatar: "https://i.pravatar.cc/100?img=1",
    content:
      "ZTS Music made booking live acts so simple. I posted a gig and had 15 quality applications within 24 hours.",
  },
  {
    name: "Rahul Verma",
    role: "Wedding Planner",
    avatar: "https://i.pravatar.cc/100?img=3",
    content:
      "Finding the perfect sangeet band used to take weeks. Now I book verified artists in days.",
  },
  {
    name: "Anjali Desai",
    role: "Solo Vocalist",
    avatar: "https://i.pravatar.cc/100?img=5",
    content:
      "As a freelance singer, getting gigs was uncertain. ZTS Music gives me steady opportunities that match my style.",
  },
  {
    name: "Vikram Malhotra",
    role: "Event Manager",
    avatar: "https://i.pravatar.cc/100?img=8",
    content:
      "We book 20+ events monthly. The platform's filtering and verified reviews save us countless hours.",
  },
  {
    name: "Meera Krishnan",
    role: "Jazz Band Leader",
    avatar: "https://i.pravatar.cc/100?img=9",
    content:
      "Our band's bookings tripled since joining. The direct communication with venues is exactly what we needed.",
  },
  {
    name: "Arjun Nair",
    role: "Restaurant Owner",
    avatar: "https://i.pravatar.cc/100?img=12",
    content:
      "Live music transformed our restaurant's ambiance. ZTS helped us find affordable acoustic artists.",
  },
];

function SpotlightCard({
  testimonial,
  index,
  isVisible,
  mousePosition,
  containerRect,
}: {
  testimonial: Testimonial;
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
        className="relative h-full rounded-2xl border border-white/[0.06] p-5 overflow-hidden"
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
        {/* Quote icon */}
        <Quote className="h-6 w-6 text-purple-500/20 mb-3" />

        {/* Rating */}
        <div className="flex gap-0.5 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="h-3.5 w-3.5 fill-amber-400/80 text-amber-400/80"
            />
          ))}
        </div>

        {/* Content */}
        <p className="text-sm leading-relaxed text-white/60">
          &ldquo;{testimonial.content}&rdquo;
        </p>

        {/* Author */}
        <div className="mt-4 flex items-center gap-3">
          <Image
            src={testimonial.avatar}
            alt={testimonial.name}
            width={36}
            height={36}
            className="rounded-full ring-1 ring-white/10"
          />
          <div>
            <div className="text-sm font-medium text-white">
              {testimonial.name}
            </div>
            <div className="text-xs text-white/40">
              {testimonial.role}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TestimonialsSection() {
  const [visibleCards, setVisibleCards] = useState<boolean[]>(new Array(testimonials.length).fill(false));
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
    <section ref={sectionRef} id="testimonials" className="relative py-24 sm:py-32">
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
            <span className="text-xs text-purple-300">Testimonials</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Trusted by{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Venues & Artists
            </span>
          </h2>
          <p className="mt-4 text-base text-white/50">
            See how venues and artists are using ZTS Music to create
            unforgettable live music experiences.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {testimonials.map((testimonial, index) => (
            <SpotlightCard
              key={testimonial.name}
              testimonial={testimonial}
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
