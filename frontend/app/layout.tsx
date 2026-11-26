import type { Metadata } from "next";
import { Footer, Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import { LangProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BiletFlow — Discover events. Book tickets.", template: "%s · BiletFlow" },
  description: "The self-service event ticketing platform for Kazakhstan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <LangProvider>
          <SessionProvider>
            <SkipLink />
            <Header />
            <main id="main" className="min-h-[70vh]">
              {children}
            </main>
            <Footer />
          </SessionProvider>
        </LangProvider>
      </body>
    </html>
  );
}
