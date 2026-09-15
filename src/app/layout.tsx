import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Liwip · SKU Images",
  description: "SKU image library for Liwip. Local storage first, S3 next.",
  icons: {
    icon: "/liwip-logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${poppins.className} h-full antialiased`}>
      <body className="min-h-full bg-[#0a0a0a] text-[#f4f4f4]">{children}</body>
    </html>
  );
}
