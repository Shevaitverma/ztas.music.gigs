"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Users, Calendar, Search, MessageSquare, CheckCircle2 } from "lucide-react";

interface Step {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const artistSteps: Step[] = [
  {
    number: "01",
    icon: <FileText className="h-6 w-6" />,
    title: "Post Your Gig",
    description:
      "Create a gig listing with your event details, budget, venue, and the type of artist you're looking for.",
  },
  {
    number: "02",
    icon: <Users className="h-6 w-6" />,
    title: "Review Applications",
    description:
      "Talented artists will apply to your gig. Browse their profiles, listen to samples, and read reviews.",
  },
  {
    number: "03",
    icon: <Calendar className="h-6 w-6" />,
    title: "Book & Perform",
    description:
      "Accept the perfect artist, confirm the booking, and enjoy an amazing live performance at your event.",
  },
];

const venueSteps: Step[] = [
  {
    number: "01",
    icon: <Search className="h-6 w-6" />,
    title: "Browse Gigs",
    description:
      "Explore open gigs that match your style, location, and availability. Filter by genre, budget, and event type.",
  },
  {
    number: "02",
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Apply & Negotiate",
    description:
      "Send a proposal with your rate. Chat directly with the organizer to fine-tune the booking details.",
  },
  {
    number: "03",
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Get Paid",
    description:
      "Funds are held in escrow on booking and released after a verified OTP check-in at the event.",
  },
];

export function HowItWorksSection() {
  const [visibleSteps, setVisibleSteps] = useState<boolean[]>(new Array(artistSteps.length).fill(false));
  const [headerVisible, setHeaderVisible] = useState(false);
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
                setVisibleSteps((prev) => {
                  const next = [...prev];
                  next[idx] = true;
                  return next;
                });
              }, idx * 200);
            }
          }
        });
      },
      { threshold: 0.3 }
    );

    const elements = sectionRef.current?.querySelectorAll("[data-index]");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative overflow-hidden py-24 sm:py-32"
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0c0515]" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 80% 30%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 10% 70%, rgba(236, 72, 153, 0.08) 0%, transparent 50%)
            `,
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
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
            <span className="text-xs text-purple-300">Simple Process</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From Gig Post to{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Live Show
            </span>
          </h2>
          <p className="mt-4 text-base text-white/50">
            Our streamlined process makes booking live music simple, whether
            you're a venue owner, event planner, or hosting a private party.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-20">
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 lg:block">
              <div className="h-full w-full bg-gradient-to-b from-purple-500/20 via-purple-500/40 to-purple-500/20" />
            </div>

            <div className="space-y-16 lg:space-y-24">
              {artistSteps.map((step, index) => (
                <div
                  key={step.number}
                  data-index={index}
                  className={`flex flex-col items-center gap-8 lg:flex-row ${
                    index % 2 === 1 ? "lg:flex-row-reverse" : ""
                  }`}
                  style={{
                    opacity: visibleSteps[index] ? 1 : 0,
                    transform: visibleSteps[index]
                      ? "translateY(0)"
                      : "translateY(30px)",
                    transition: "opacity 0.6s ease, transform 0.6s ease",
                  }}
                >
                  {/* Content */}
                  <div
                    className={`flex-1 text-center lg:text-left ${
                      index % 2 === 1 ? "lg:text-right" : ""
                    }`}
                  >
                    <span className="inline-block text-5xl font-bold bg-gradient-to-b from-purple-400/40 to-purple-400/10 bg-clip-text text-transparent">
                      {step.number}
                    </span>
                    <h3 className="mt-3 text-xl font-bold text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-white/50 mx-auto lg:mx-0">
                      {step.description}
                    </p>
                  </div>

                  {/* Icon */}
                  <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 blur-xl" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-[#0c0515] text-purple-400">
                      {step.icon}
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="hidden flex-1 lg:block" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* For Venue Owners */}
        <div className="mt-24 lg:mt-32">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center text-2xl font-bold text-foreground"
          >
            For <span className="text-gradient">Venue Owners</span>
          </motion.h3>
          <div className="relative">
            <div className="space-y-12 lg:space-y-16">
              {venueSteps.map((step, index) => (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.2 }}
                  className={`flex flex-col items-center gap-8 lg:flex-row ${
                    index % 2 === 1 ? "lg:flex-row-reverse" : ""
                  }`}
                >
                  {/* Content */}
                  <div
                    className={`flex-1 text-center lg:text-left ${
                      index % 2 === 1 ? "lg:text-right" : ""
                    }`}
                  >
                    <span className="inline-block text-6xl font-bold text-primary/20">
                      {step.number}
                    </span>
                    <h3 className="mt-4 text-2xl font-bold text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-3 max-w-md text-muted-foreground">
                      {step.description}
                    </p>
                  </div>

                  {/* Icon */}
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 blur-xl" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-border bg-card text-violet-500">
                      {step.icon}
                    </div>
                  </div>

                  {/* Spacer */}
                  <div className="hidden flex-1 lg:block" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
