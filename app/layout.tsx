import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { version } from "../package.json";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Tiksave",
  description: "Automatically keep your TikTok streak alive.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <footer className="p-4 text-center text-xs text-gray-500">Tiksave v{version}</footer>
      </body>
    </html>
  );
}
