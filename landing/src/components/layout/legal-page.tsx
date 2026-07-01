import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/layout/footer";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0c0515]">
      <main className="mx-auto max-w-3xl px-6 py-20 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-white/50">Last updated: {updated}</p>

        <div className="legal-prose mt-10 space-y-6 text-sm leading-relaxed text-white/70">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}
