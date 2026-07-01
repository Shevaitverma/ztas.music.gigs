import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

// Use Geist fonts for consistency with the web app
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gigs.ztas.in";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ZTS Gigs | Book Live Musicians & Artists across India",
    template: "%s | ZTS Gigs",
  },
  description:
    "ZTS Gigs is an early-access marketplace for live music in India. Post a gig, get quotes from local artists and bands, compare proposals, and book the right act for weddings, parties, cafes, and corporate events.",
  keywords: [
    "live music booking India",
    "book musicians India",
    "hire DJ",
    "live band for events",
    "music gig marketplace",
    "wedding musicians",
    "sangeet band",
    "corporate event music",
    "book artists Mumbai",
    "live performance booking",
  ],
  authors: [{ name: "ZTS Gigs", url: siteUrl }],
  creator: "ZTS Gigs",
  publisher: "ZTS Gigs",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "ZTS Gigs | Book Live Musicians & Artists across India",
    description:
      "An early-access marketplace for live music in India. Post a gig, get quotes from local artists, and book the right act for your event.",
    url: siteUrl,
    siteName: "ZTS Gigs",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "ZTS Gigs | Book Live Musicians & Artists across India",
    description:
      "An early-access marketplace for live music in India. Post a gig, get quotes, and book the right act for your event.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
  alternates: {
    canonical: siteUrl,
  },
  category: "Music",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// JSON-LD structured data for SEO.
// Note: no aggregateRating/review schema — we have no genuine reviews yet, and
// fabricated review markup violates Google's structured-data policies.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ZTS Gigs",
  description:
    "An early-access marketplace connecting event organisers with live musicians and bands across India.",
  url: siteUrl,
  applicationCategory: "Entertainment",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    description:
      "Free to join and post gigs. The platform charges a commission only on completed bookings.",
  },
  creator: {
    "@type": "Organization",
    name: "ZTS Gigs",
    url: siteUrl,
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ZTS Gigs",
  url: siteUrl,
  description:
    "An early-access marketplace for booking live musicians and bands for events across India.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}


