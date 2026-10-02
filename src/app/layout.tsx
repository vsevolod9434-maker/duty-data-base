import type { Metadata } from "next";
import { DutyQueryProvider } from "@/components/providers/DutyQueryProvider";
import { StaticAuthGate } from "@/components/providers/StaticAuthGate";
import { ModalKeyboardBridge } from "@/components/ui/ModalKeyboardBridge";
import { PdaNoticeTray } from "@/components/ui/PdaNoticeTray";
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
          <ModalKeyboardBridge />
          <PdaNoticeTray />
        </DutyQueryProvider>
      </body>
    </html>
  );
}
