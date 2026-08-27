/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't advertise the framework in responses (audit M2).
  poweredByHeader: false,

  // Baseline security headers (audit M2, 2026-08-27). A full Content-Security-
  // Policy is deliberately NOT included here yet: the app has an inline
  // dark-mode init script (see src/app/layout.tsx) and pulls fonts/images
  // from Google Drive + Vercel Blob, so a CSP needs a nonce/hash pass and
  // real testing across every page before it can ship without breaking
  // rendering — tracked as a follow-up, not attempted under this week's
  // deadline.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Same-origin framing only — the dashboard has irreversible
          // actions (approve/void/delete) that must not be clickjackable.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // HSTS: Vercel terminates TLS for every deployment, so this is
          // safe to set unconditionally (no plain-HTTP prod origin exists).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
