// Centralised outbound links.
//
// The live web app is served from gigs.ztas.in (see server cookie config).
// Override with NEXT_PUBLIC_APP_URL per environment. Every conversion CTA on
// the marketing site routes through these helpers so the app domain is
// configured in exactly one place.
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://gigs.ztas.in";

// Early access is open registration during the beta.
export const SIGNUP_URL = `${APP_URL}/register`;
export const LOGIN_URL = `${APP_URL}/login`;

// In-page anchor for the early-access / "request access" block.
export const EARLY_ACCESS_HREF = "#early-access";
