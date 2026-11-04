import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Shell } from "@/components/Shell";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-jb", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lighthouse · Retention Intelligence",
  description: "See which customers are drifting away, why, and which offer will actually keep them.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
