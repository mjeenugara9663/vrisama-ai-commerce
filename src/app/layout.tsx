import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
const metadataBase = (() => { try { return new URL(process.env.APP_URL ?? ""); } catch { return new URL("http://localhost:3000"); } })();
export const metadata: Metadata = {
  metadataBase,
  title: { default: "Vrisama AI Commerce", template: "%s · Vrisama" },
  description: "One AI-powered command center for your storefront, leads and marketing.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="topbar"><div className="shell navrow">
      <Link href="/" className="brand"><span className="brandmark">V</span><span>vrisama<span className="brandlight">/ai commerce</span></span></Link>
      <nav><Link href="/#features">Features</Link><Link href="/#pricing">Pricing</Link><Link className="navcta" href="/dashboard">Open dashboard ↗</Link></nav>
    </div></header>
    {children}
    <footer className="footer"><div className="shell footerrow"><span>© {new Date().getFullYear()} Vrisama · An original SaaS starter</span><span>Built for ambitious small businesses.</span></div></footer>
  </body></html>;
}
