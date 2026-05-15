import type { Metadata } from "next";
import { Khand } from "next/font/google";
import { DutyQueryProvider } from "@/components/providers/DutyQueryProvider";
import "./globals.css";

const khand = Khand({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-khand",
});

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
    <html lang="ru" className={khand.variable}>
      <body>
        <DutyQueryProvider>{children}</DutyQueryProvider>
      </body>
    </html>
  );
}
