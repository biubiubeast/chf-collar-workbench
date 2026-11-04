import type { Metadata } from "next";
import "./globals.css";
import "./presentation.css";
import {ModuleLayoutProvider} from "@/components/module-layout";
import {SiteSessionProvider} from "@/components/site-session";

export const metadata: Metadata = {
  title: "CHF 领口对冲工作台",
  description: "设计瑞郎领口期权，分析成本、收益边界、期限缺口与完整资金流。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased"><SiteSessionProvider><ModuleLayoutProvider>{children}</ModuleLayoutProvider></SiteSessionProvider></body>
    </html>
  );
}
