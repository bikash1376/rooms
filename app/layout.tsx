import type { Metadata } from "next";
import { Press_Start_2P, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rooms — a pixel office with real memory",
  description:
    "Walk a pixel office where three AI coworkers live. Two remember everything with Cognee; one woke up with no memory at all. Built for the WeMakeDevs × Cognee hackathon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${pixel.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bitcount+Prop+Single&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
