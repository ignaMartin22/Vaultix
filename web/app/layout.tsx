import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { DevnetBanner } from "@/components/DevnetBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Providers } from "./providers";
import "./globals.css";

// The optical size axis gives Inter Display (05 §5) at "opsz" 32.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vaultix · Pago protegido",
  description: "Tu plata queda en bóveda hasta que confirmes que llegó.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#08090B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-vault-black font-sans text-body text-bone">
        <a
          href="#contenido"
          className="sr-only z-[60] rounded-lg bg-ion-blue px-4 py-2 text-bone focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Saltar al contenido
        </a>
        <DevnetBanner />
        <Providers>
          <SiteHeader />
          <div id="contenido" className="flex flex-1 flex-col">
            {children}
          </div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
