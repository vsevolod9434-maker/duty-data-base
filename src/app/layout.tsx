import type { Metadata } from "next";
import { DutyQueryProvider } from "@/components/providers/DutyQueryProvider";
import { StaticAuthGate } from "@/components/providers/StaticAuthGate";
import "./globals.css";
import "./pda-2009-theme.css";
import "./pda-2009-complete.css";
import "./pda-2009-hardware.css";
import "./pda-ui-audit.css";

export const metadata: Metadata = {
  title: "Система учёта «Долг»",
  description: "Внутренняя база учёта группировки «Долг»",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <DutyQueryProvider>
          <StaticAuthGate>{children}</StaticAuthGate>
        </DutyQueryProvider>
      </body>
    </html>
  );
}
