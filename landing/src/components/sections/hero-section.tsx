"use client";

import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState, useRef, useCallback } from "react";

// Shared orbit positions - artists and venues use the same slots so swapping is seamless
const orbitSlots = [
  { ring: 0, angleOffset: 0 },
  { ring: 0, angleOffset: 120 },
  { ring: 0, angleOffset: 240 },
  { ring: 1, angleOffset: 40 },
  { ring: 1, angleOffset: 160 },
  { ring: 1, angleOffset: 280 },
  { ring: 2, angleOffset: 20 },
  { ring: 2, angleOffset: 140 },
  { ring: 2, angleOffset: 260 },
];

const artistData = [
  { image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face", label: "Singer" },
  { image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face", label: "DJ" },
  { image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop&crop=face", label: "Guitarist" },
  { image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face", label: "Pianist" },
  { image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&h=100&fit=crop&crop=face", label: "Vocalist" },
  { image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=face", label: "Drummer" },
  { image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face", label: "Bassist" },
  { image: "https://images.unsplash.com/photo-1488161628813-04466f0ec8b4?w=100&h=100&fit=crop&crop=face", label: "Saxophonist" },
  { image: "https://images.unsplash.com/photo-1463453091185-61582044d556?w=100&h=100&fit=crop&crop=face", label: "Producer" },
];

const venueData = [
  { icon: "🏟️", label: "Stadium" },
  { icon: "🎭", label: "Theater" },
  { icon: "🎪", label: "Festival" },
  { icon: "🍸", label: "Lounge" },
  { icon: "🎤", label: "Club" },
  { icon: "🏰", label: "Mansion" },
  { icon: "🎵", label: "Studio" },
  { icon: "⛪", label: "Chapel" },
  { icon: "🏖️", label: "Beach" },
];

// Combine data with shared positions
const artists = artistData.map((artist, i) => ({
  id: i + 1,
  ...artist,
  ...orbitSlots[i],
}));

const venues = venueData.map((venue, i) => ({
  id: i + 1,
  ...venue,
  ...orbitSlots[i],
}));

const ringRadii = [80, 125, 170];
const ringSpeeds = [0.015, -0.01, 0.008];
const centerX = 190;
const centerY = 190;
const MAX_DELTA = 50; // Cap delta to prevent huge jumps when returning from background

type Phase = "artist" | "venue";

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Calculate static initial position (rounded to avoid hydration mismatch)
const getStaticPosition = (ringIndex: number, angleOffset: number) => {
  const angle = (angleOffset * Math.PI) / 180;
  return {
    x: Math.round(centerX + Math.cos(angle) * ringRadii[ringIndex]),
    y: Math.round(centerY + Math.sin(angle) * ringRadii[ringIndex]),
  };
};

export function HeroSection() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("artist");
  const [ringRotations, setRingRotations] = useState([0, 0, 0]);
  const [swapProgress, setSwapProgress] = useState(0);
  const [isSwapping, setIsSwapping] = useState(false);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const ringRotationsRef = useRef([0, 0, 0]);
  const phaseRef = useRef<Phase>("artist");
  const isSwappingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Set mounted on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Swap animation trigger - smooth crossfade between artist/venue states
  const triggerSwap = useCallback(() => {
    if (isSwappingRef.current) return;
    isSwappingRef.current = true;
    setIsSwapping(true);

    let start: number | null = null;
    const duration = 1000; // 1 second crossfade

    const animateSwap = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      setSwapProgress(easeOutExpo(progress));

      if (progress < 1) {
        requestAnimationFrame(animateSwap);
      } else {
        setPhase((prev) => (prev === "artist" ? "venue" : "artist"));
        setSwapProgress(0);
        setIsSwapping(false);
        isSwappingRef.current = false;
      }
    };

    requestAnimationFrame(animateSwap);
  }, []);

  // Main animation loop - only runs after mount
  useEffect(() => {
    if (!mounted) return;

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      let delta = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      // Cap delta to prevent huge jumps when returning from background tab
      delta = Math.min(delta, MAX_DELTA);

      // Update ref directly for position calculations
      ringRotationsRef.current = ringRotationsRef.current.map(
        (rot, i) => (rot + delta * ringSpeeds[i]) % 360
      );

      // Update state for re-render
      setRingRotations([...ringRotationsRef.current]);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [mounted]);

  // Phase cycle - simple interval, runs every 5 seconds
  useEffect(() => {
    if (!mounted) return;

    // Use a stable interval that fires every 5 seconds
    const intervalId = setInterval(() => {
      if (!isSwappingRef.current) {
        triggerSwap();
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [mounted, triggerSwap]);

  // Get dynamic position for rendering (uses state, rounded for consistency)
  const getPosition = useCallback((ringIndex: number, angleOffset: number) => {
    const angle = ((ringRotations[ringIndex] + angleOffset) * Math.PI) / 180;
    return {
      x: Math.round(centerX + Math.cos(angle) * ringRadii[ringIndex]),
      y: Math.round(centerY + Math.sin(angle) * ringRadii[ringIndex]),
    };
  }, [ringRotations]);

  const isArtistCenter = phase === "artist";

  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0c0515]" />
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 20% 20%, rgba(120, 80, 180, 0.15) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 80% 30%, rgba(100, 60, 160, 0.1) 0%, transparent 50%),
              radial-gradient(ellipse 50% 50% at 60% 80%, rgba(80, 40, 140, 0.08) 0%, transparent 50%)
            `,
          }}
        />
        <div
          className="absolute -left-20 -top-20 h-[500px] w-[500px]"
          style={{
            background: `radial-gradient(ellipse at center, rgba(255, 140, 50, 0.1) 0%, rgba(255, 100, 50, 0.05) 30%, transparent 60%)`,
            filter: "blur(40px)",
          }}
        />
        <div
          className="absolute right-[10%] top-1/2 h-[600px] w-[600px] -translate-y-1/2"
          style={{
            background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 60%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-20 lg:px-8">
        <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left side */}
          <div className="hero-text">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-purple-300">Live gigs available now</span>
            </div>

            <h1 className="font-sans text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
              Book Top Talent
              <br />
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                One Click Away
              </span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-relaxed text-white/50">
              Connect with musicians, DJs, and performers for your next event. Simple booking, verified artists, unforgettable experiences.
            </p>

            <div className="mt-8 flex items-center gap-4">
              <Link href="https://app.ztsmusic.com/register">
                <Button
                  size="lg"
                  className="group h-12 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 text-white shadow-lg shadow-purple-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/30 hover:brightness-110"
                >
                  Join Now
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="ghost" size="lg" className="h-12 text-white/60 hover:bg-white/5 hover:text-white">
                  How it works
                </Button>
              </Link>
            </div>

            <div className="mt-10 flex items-center gap-6">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-8 w-8 overflow-hidden rounded-full border-2 border-[#0c0515]">
                    <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div className="text-sm">
                <span className="font-semibold text-white">2,500+</span>
                <span className="text-white/40"> artists joined this month</span>
              </div>
            </div>
          </div>

          {/* Right side - Orbit */}
          <div className="relative flex items-center justify-center lg:justify-end">
            <div className="relative h-[380px] w-[380px]">
              {/* Glow */}
              <div
                className="absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)", filter: "blur(30px)" }}
              />

              {/* Rings */}
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 380" fill="none">
                <defs>
                  <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(139,92,246,0.4)" />
                    <stop offset="50%" stopColor="rgba(139,92,246,0.15)" />
                    <stop offset="100%" stopColor="rgba(236,72,153,0.4)" />
                  </linearGradient>
                </defs>
                {ringRadii.map((r, i) => (
                  <circle
                    key={i}
                    cx="190"
                    cy="190"
                    r={r}
                    stroke={i === 1 ? "url(#ringGrad)" : "rgba(255,255,255,0.08)"}
                    strokeWidth={i === 1 ? "2" : "1"}
                    fill="none"
                    opacity={i === 1 ? 1 : 0.6}
                  />
                ))}
              </svg>

              {/* Center item - crossfade between artist and venue */}
              {(() => {
                // Same logic as orbiters: transition FROM current TO opposite
                const artistCenterOpacity = isSwapping
                  ? (isArtistCenter ? 1 - swapProgress : swapProgress)
                  : (isArtistCenter ? 1 : 0);
                const venueCenterOpacity = 1 - artistCenterOpacity;

                return (
                  <div
                    className="absolute z-20 flex flex-col items-center"
                    style={{
                      left: centerX,
                      top: centerY,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {/* Container for both center items stacked */}
                    <div className="relative h-12 w-12">
                      {/* Artist center */}
                      <div
                        className="absolute inset-0 overflow-hidden rounded-full border-2 border-purple-400/60 shadow-lg shadow-purple-500/30"
                        style={{
                          opacity: artistCenterOpacity,
                          transform: `scale(${0.85 + artistCenterOpacity * 0.15})`,
                        }}
                      >
                        <img
                          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face"
                          alt="Artist"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {/* Venue center */}
                      <div
                        className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-amber-400/60 bg-gradient-to-br from-white/15 to-white/5 text-2xl shadow-lg shadow-amber-500/20"
                        style={{
                          opacity: venueCenterOpacity,
                          transform: `scale(${0.85 + venueCenterOpacity * 0.15})`,
                        }}
                      >
                        🏟️
                      </div>
                    </div>
                    {/* Labels */}
                    <div className="relative mt-1.5 h-3">
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-white/70"
                        style={{ opacity: artistCenterOpacity }}
                      >
                        Artist
                      </span>
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-white/70"
                        style={{ opacity: venueCenterOpacity }}
                      >
                        Venue
                      </span>
                    </div>
                  </div>
                );
              })()}


              {/* Orbiting items - render both artists and venues, crossfade between them */}
              {orbitSlots.map((slot, index) => {
                const pos = mounted
                  ? getPosition(slot.ring, slot.angleOffset)
                  : getStaticPosition(slot.ring, slot.angleOffset);
                const sizes = ["h-9 w-9", "h-11 w-11", "h-10 w-10"];
                const textSizes = ["text-base", "text-xl", "text-lg"];

                const artist = artists[index];
                const venue = venues[index];

                // Venues orbit when artist is at center, artists orbit when venue is at center
                const showVenues = phase === "artist";
                // During swap: crossfade FROM current TO opposite
                // If showing venues, transition TO artists (venueOpacity: 1→0)
                // If showing artists, transition TO venues (venueOpacity: 0→1)
                const venueOpacity = isSwapping
                  ? (showVenues ? 1 - swapProgress : swapProgress)
                  : (showVenues ? 1 : 0);
                const artistOpacity = 1 - venueOpacity;

                return (
                  <div
                    key={index}
                    className="absolute z-10 flex flex-col items-center"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {/* Container for both bubbles stacked */}
                    <div className="relative">
                      {/* Venue bubble */}
                      <div
                        className={`${sizes[slot.ring]} flex items-center justify-center rounded-full border border-white/25 bg-white/15 ${textSizes[slot.ring]} backdrop-blur-sm shadow-md`}
                        style={{
                          opacity: venueOpacity,
                          transform: `scale(${0.8 + venueOpacity * 0.2})`,
                        }}
                      >
                        {venue.icon}
                      </div>
                      {/* Artist bubble - absolute positioned on top */}
                      <div
                        className={`${sizes[slot.ring]} absolute inset-0 overflow-hidden rounded-full border-2 border-white/30 shadow-lg shadow-purple-500/25`}
                        style={{
                          opacity: artistOpacity,
                          transform: `scale(${0.8 + artistOpacity * 0.2})`,
                        }}
                      >
                        <img src={artist.image} alt={artist.label} className="h-full w-full object-cover" />
                      </div>
                    </div>
                    {/* Label - crossfade too */}
                    <div className="relative mt-1 h-3">
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-medium text-white/50"
                        style={{ opacity: venueOpacity }}
                      >
                        {venue.label}
                      </span>
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-medium text-white/50"
                        style={{ opacity: artistOpacity }}
                      >
                        {artist.label}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Stats */}
              <div className="absolute -bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-black/50 px-5 py-2.5 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-base font-bold text-white">5k+</div>
                    <div className="text-[9px] text-white/40">Artists</div>
                  </div>
                  <div className="h-6 w-px bg-white/10" />
                  <div className="text-center">
                    <div className="text-base font-bold text-white">2k+</div>
                    <div className="text-[9px] text-white/40">Venues</div>
                  </div>
                  <div className="h-6 w-px bg-white/10" />
                  <div className="text-center">
                    <div className="text-base font-bold text-white">10k+</div>
                    <div className="text-[9px] text-white/40">Gigs</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .hero-text { animation: fadeSlideUp 0.8s ease-out both; }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
