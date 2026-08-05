import { Music2 } from 'lucide-react'
import Link from 'next/link'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-fuchsia-600/20 to-orange-500/20" />
        <div className="absolute inset-0 bg-surface/90" />

        {/* Decorative circles */}
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-violet-600/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-fuchsia-600/30 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 lg:px-20">
          <Link href="/" className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Music2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold gradient-text">ZTS Music</span>
          </Link>

          <h1 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-6">
            The Future of{' '}
            <span className="gradient-text">Live Music</span>{' '}
            Booking
          </h1>

          <p className="text-lg text-foreground-muted max-w-md">
            Post a gig, compare real proposals from musicians, and book the act
            that fits. Built in India, for Indian events.
          </p>

          {/*
            No testimonial here. This carried a fabricated quote ("saved us 40%
            on our wedding band" — Rahul Sharma, Event Organizer, Mumbai) and a
            "thousands of talented artists" claim, on the first screen every user
            sees, while the platform had no users at all. The landing site was
            cleaned of the same thing; this copy lived in web/ and was missed.
            Don't reintroduce social proof until it is real.
          */}
          <div className="mt-12 p-6 rounded-2xl bg-surface-elevated/50 border border-white/5 max-w-md">
            <p className="text-sm font-medium text-foreground mb-2">Early access</p>
            <p className="text-foreground-muted text-sm">
              We&rsquo;re onboarding our first artists and organisers in Mumbai.
              Payment is arranged directly between you and the artist for now —
              escrow and OTP-verified check-in are rolling out during the beta.
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <Link href="/" className="flex items-center gap-3 mb-8 lg:hidden justify-center">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
              <Music2 className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">ZTS Music</span>
          </Link>

          {children}
        </div>
      </div>
    </div>
  )
}
