import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Printerval Design Intelligence",
  description: "Discover emerging opportunities and turn them into designs.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
