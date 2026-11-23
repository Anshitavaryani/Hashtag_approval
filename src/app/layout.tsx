import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";

import "./globals.css";

// The shop's font, Inter, from the @fontsource-variable/inter package: built into the
// site, so no page asks another host for anything.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Review your artwork | HashtagBillionaire",
    template: "%s | HashtagBillionaire",
  },
  description: "Review and approve the artwork for your HashtagBillionaire order.",
  // Approval pages are private: out of search results, and no address sent on to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#b4b8c0",
};

/** Points sonner's colour variables at the design tokens in globals.css (as the shop does). */
const mix = (token: string, pct: number) => `color-mix(in srgb, var(--color-${token}) ${pct}%, transparent)`;
const toastTheme = {
  "--normal-bg": "var(--color-card)",
  "--normal-border": "var(--color-border)",
  "--normal-text": "var(--color-foreground)",
  "--success-bg": "var(--color-success-soft)",
  "--success-border": mix("success", 30),
  "--success-text": "var(--color-success)",
  "--error-bg": "var(--color-destructive-soft)",
  "--error-border": mix("destructive", 30),
  "--error-text": "var(--color-destructive)",
  "--info-bg": "var(--color-primary-soft)",
  "--info-border": "var(--color-primary)",
  "--info-text": "var(--color-foreground)",
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <Toaster position="top-center" richColors closeButton style={toastTheme} />
      </body>
    </html>
  );
}
