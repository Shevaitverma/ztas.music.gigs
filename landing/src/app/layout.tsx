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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ztsmusic.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ZTS Music | Book Live Musicians & Artists for Your Events",
    template: "%s | ZTS Music",
  },
  description:
    "ZTS Music connects venues and event organizers with talented musicians. Find live bands, DJs, soloists, and acoustic artists for your next event. Post gigs, discover talent, and book performances easily.",
  keywords: [
    "live music booking",
    "book musicians",
    "hire DJ",
    "live band for events",
    "music gig marketplace",
    "artist booking platform",
    "venue entertainment",
    "wedding musicians",
    "corporate event music",
    "live performance booking",
  ],
  authors: [{ name: "ZTS Music", url: siteUrl }],
  creator: "ZTS Music",
  publisher: "ZTS Music",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "ZTS Music | Book Live Musicians & Artists for Your Events",
    description:
      "Connect with talented musicians for your events. Find live bands, DJs, soloists, and more. The easiest way to book live entertainment.",
    url: siteUrl,
    siteName: "ZTS Music",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ZTS Music - Book Live Musicians",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZTS Music | Book Live Musicians & Artists",
    description:
      "Connect with talented musicians for your events. The easiest way to book live entertainment.",
    images: ["/og-image.png"],
    creator: "@ztsmusic",
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

// JSON-LD structured data for SEO
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "ZTS Music",
  description:
    "A marketplace connecting venues and event organizers with talented musicians for live performances.",
  url: siteUrl,
  applicationCategory: "Entertainment",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free to browse and post gigs",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "1250",
    bestRating: "5",
    worstRating: "1",
  },
  creator: {
    "@type": "Organization",
    name: "ZTS Music",
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    sameAs: [
      "https://twitter.com/ztsmusic",
      "https://www.instagram.com/ztsmusic",
    ],
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ZTS Music",
  url: siteUrl,
  logo: `${siteUrl}/logo.png`,
  description: "The leading platform for booking live musicians and artists for events.",
  sameAs: [
    "https://twitter.com/ztsmusic",
    "https://www.instagram.com/ztsmusic",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "Customer Support",
    email: "support@ztsmusic.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
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


