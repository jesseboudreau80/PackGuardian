import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TenantProvider from "./context/TenantContext";
import AuthProvider from "./context/AuthContext";
import WorkspaceProvider from "./context/WorkspaceContext";
import AppHeader from "./components/AppHeader";
import MainWrapper from "./components/MainWrapper";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PackGuardian",
  description:
    "AI-powered safety and compliance protection for pet care operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 text-gray-900`}
      >
        <TenantProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <AppHeader />
              <MainWrapper>{children}</MainWrapper>
            </WorkspaceProvider>
          </AuthProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
