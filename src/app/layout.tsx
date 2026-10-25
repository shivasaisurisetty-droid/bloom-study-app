import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bloom — Your Study Buddy",
  description: "A friendly, motivating NPTEL quiz study app. Practice any weeks in shuffled order, with answers verified against the solution PDFs.",
};

export const viewport: Viewport = {
  themeColor: "#f6f8ff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
