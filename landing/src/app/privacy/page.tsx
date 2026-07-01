import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ZTS Gigs collects, uses, and protects your information during early access.",
  robots: { index: true, follow: true },
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 text-lg font-semibold text-white">{children}</h2>
  );
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="26 June 2026">
      <p>
        This policy explains how ZTS Gigs handles your information. We are an
        early-access marketplace for live music in India, and we aim to collect
        only what we need to run the service. We will keep this policy aligned
        with India&rsquo;s Digital Personal Data Protection framework as we
        launch.
      </p>

      <H2>1. Information we collect</H2>
      <p>
        Account details you provide (such as name, email, phone, and city),
        content you create (gig listings, profiles, proposals, and messages), and
        basic technical information needed to operate and secure the platform.
      </p>

      <H2>2. How we use it</H2>
      <p>
        To create your account, match organisers with artists, enable messaging
        and bookings, provide support, and improve the product. We do not sell
        your personal data.
      </p>

      <H2>3. Verification and payments</H2>
      <p>
        Identity verification (KYC) and escrow payments are being built and are
        not fully live during early access. When these go live, any documents or
        payment details you share will be handled in line with applicable law and
        described in an updated version of this policy.
      </p>

      <H2>4. Sharing</H2>
      <p>
        Profile and proposal information is shared with the other side of a
        booking so you can connect. We use trusted service providers (for example,
        hosting and communications) under appropriate safeguards.
      </p>

      <H2>5. Your choices</H2>
      <p>
        You can access and update your account information, and request deletion
        of your account. Contact us through the app to exercise these choices.
      </p>

      <H2>6. Changes</H2>
      <p>
        We will update the &ldquo;last updated&rdquo; date above when this policy
        changes, and communicate material changes through the app.
      </p>

      <H2>7. Contact</H2>
      <p>
        For privacy questions, reach out to us through your ZTS Gigs account.
      </p>
    </LegalPage>
  );
}
