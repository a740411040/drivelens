import type { Metadata } from "next";
import "./globals.css";

const title = "DriveLens｜无人车异常行为诊断工具箱";
const description = "将几秒钟异常还原为可回放的时序证据、候选疑因和可证伪排查路径，辅助无人车研发与测试快速形成工程线索。";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: "/og-v2.png", width: 1731, height: 909, alt: "DriveLens 无人车异常行为诊断工具箱" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og-v2.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
