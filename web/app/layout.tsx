import type { Metadata } from "next";
import { Footer, Header } from "@/components/Header";
import { LangProvider } from "@/lib/i18n";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BiletFlow — Discover events. Book tickets.", template: "%s · BiletFlow" },
  description: "The self-service event ticketing platform for Kazakhstan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <LangProvider>
          <SessionProvider>
            <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
              Skip to content
            </a>
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
