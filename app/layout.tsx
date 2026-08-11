import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Gradion / Folio — Book Illustration Studio",
    description:
      "An editorial prototype for turning manuscripts into art direction, character portraits, and chapter illustrations through a resilient five-stage Gemini pipeline.",
    icons: {
      icon: "/og.png",
      shortcut: "/og.png",
    },
    openGraph: {
      title: "Gradion / Folio — Book Illustration Studio",
      description: "Turn prose into plates, one deliberate stage at a time.",
      type: "website",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1672,
          height: 939,
          alt: "Gradion Folio editorial book illustration studio",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Gradion / Folio — Book Illustration Studio",
      description: "Turn prose into plates, one deliberate stage at a time.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
