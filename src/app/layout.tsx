import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SEO Gap Analyzer | MEGA AI",
  description: "Discover high-value keyword opportunities your competitors are ranking for — but you're not.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 min-h-screen flex flex-col`}>
        <main className="flex-1">{children}</main>
        <footer className="text-center py-6 text-sm text-gray-400">
          Powered by <span className="font-semibold text-gray-500">MEGA AI</span>
        </footer>
      </body>
    </html>
  );
}
