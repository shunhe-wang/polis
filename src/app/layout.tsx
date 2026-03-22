import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/layout/app-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Polis — Informed Citizens, Stronger Democracy",
  description:
    "Get personalized, transparent candidate recommendations based on your values. Non-partisan, cited, and explainable.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Polis",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#ffffff" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem("theme");
                  var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  var theme = stored === "dark" || stored === "light" ? stored : (systemDark ? "dark" : "light");
                  document.documentElement.classList.toggle("dark", theme === "dark");
                  document.documentElement.dataset.theme = theme;
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full">
        <div className="app-shell min-h-screen">
          <AppHeader />
          <div className="relative flex min-h-[calc(100vh-4.5rem)] flex-col">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
