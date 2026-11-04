import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lighthouse · Retention Intelligence",
  description: "See which customers are about to leave, what each one is worth, and which offer will actually keep them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link href="https://api.fontshare.com/v2/css?f[]=erode@300,400,500,600&display=swap" rel="stylesheet" />
      </head>
      <body className={`${geist.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
