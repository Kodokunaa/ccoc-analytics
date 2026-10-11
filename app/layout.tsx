import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import "./wlmouse-theme.css";
import "./transparency.css";
import "./brand-theme.css";
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-poppins",
});
export const metadata: Metadata = {
  icons: { icon: "/branding/church-logo-orange.png" },
  title: "City Church of Christ | Transparency",
  description:
    "Public attendance, giving, and monthly transparency reports for City Church of Christ",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
