import "./globals.css";
import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import cargomaticIcon from "@/assets/cargomatic-icon.png";

export const metadata: Metadata = {
  title: "ClearCargo",
  description: "AI back-office automation for freight forwarders",
  icons: {
    icon: cargomaticIcon.src,
    shortcut: cargomaticIcon.src,
    apple: cargomaticIcon.src,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
