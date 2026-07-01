import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of the ZTS Gigs early-access marketplace.",
  robots: { index: true, follow: true },
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 text-lg font-semibold text-white">{children}</h2>
  );
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="26 June 2026">
      <p>
        ZTS Gigs is an early-access (beta) marketplace that connects event
        organisers with musicians and bands across India. By creating an account
        or using the platform, you agree to these terms. The service is offered
        on an &ldquo;as is&rdquo; basis while in beta, and features may change as
        we build.
      </p>

      <H2>1. Who can use ZTS Gigs</H2>
      <p>
        You must be at least 18 years old and able to enter into a binding
        contract under Indian law. Artists and organisers are responsible for the
        accuracy of the information on their profiles and gig listings.
      </p>

      <H2>2. How bookings work</H2>
      <p>
        Organisers post gig briefs; artists respond with quotes and proposals.
        ZTS Gigs is a marketplace that helps both sides connect and agree terms.
        The contract for any performance is between the organiser and the artist.
      </p>

      <H2>3. Fees</H2>
      <p>
        It is free to join, create a profile, and post or respond to gigs. The
        platform charges a commission (currently planned at around 10&ndash;12%)
        only on completed bookings. Escrow payments and OTP-based release are
        being rolled out during the beta; until then, any fee terms shown are
        indicative and will be confirmed in-app before you complete a booking.
      </p>

      <H2>4. Conduct</H2>
      <p>
        You agree not to misuse the platform, post unlawful or misleading
        content, or attempt to circumvent the booking and payment process. We may
        suspend accounts that breach these terms.
      </p>

      <H2>5. Liability</H2>
      <p>
        ZTS Gigs is not a party to the performance contract and is not liable for
        the conduct of organisers or artists, the quality of any performance, or
        disputes between users, except as required by applicable law.
      </p>

      <H2>6. Changes</H2>
      <p>
        Because we are in early access, these terms will evolve. We will update
        the &ldquo;last updated&rdquo; date above when we make changes, and
        material changes will be communicated through the app.
      </p>

      <H2>7. Contact</H2>
      <p>
        Questions about these terms? Reach out to us through your ZTS Gigs
        account, and we&rsquo;ll be happy to help.
      </p>
    </LegalPage>
  );
}
