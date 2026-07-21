import { GeistSans } from "geist/font/sans";
import "./globals.css";
import DevModePanel from "@/developer-mode/DevModePanel";

export const metadata = {
  title: "Mastery Studio",
  description: "Keller Model PSI math practice with AI proctoring and remediation",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={GeistSans.className}>
        {children}
        <DevModePanel
          productName="Mastery Studio"
          mode="personal"
          sourceRepo="andrewdinbc/math-mastery"
          userEmail="aj@chalkcircuit.ca"
          userKey="mastery_studio_dev"
          morpheusUrl="https://morpheus-scheduler.vercel.app"
          enabled={true}
          audienceLabel="a math teacher"
        />
      </body>
    </html>
  );
}
