import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroSection } from "@/components/sections/hero-section";
import { FeaturesSection } from "@/components/sections/features-section";
import { HowItWorksSection } from "@/components/sections/how-it-works-section";
import { PricingSection } from "@/components/sections/pricing-section";
import { TestimonialsSection } from "@/components/sections/testimonials-section";
import { CtaSection } from "@/components/sections/cta-section";

function LoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <Navbar />
      </Suspense>
      <main>
        <Suspense fallback={<LoadingFallback />}>
          <HeroSection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <FeaturesSection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <HowItWorksSection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <PricingSection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <TestimonialsSection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <CtaSection />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}


