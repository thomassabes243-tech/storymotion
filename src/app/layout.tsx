import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "../components/PwaRegistration";
export const metadata: Metadata = {
  title: "StoryMotion · De historia a movimiento",
  description:
    "Estudio independiente de animación narrativa 2.5D. De texto a MP4 con narración opcional.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#171918",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
