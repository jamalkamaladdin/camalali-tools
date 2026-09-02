import type { Metadata } from "next";
import { Geist_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/lib/site";

// latin-ext carries ə Ə ğ Ğ İ ş Ş — without it those letters fall back to a
// system font mid-sentence. The subset array must stay a literal in every call
// below: a spread breaks next/font's static analysis and the subset is dropped.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Editorial serif for headings and the wordmark — the one face that tells this
// site apart from a generated template. Its latin-ext subset was checked for
// ə Ə ğ Ğ İ ş Ş ı before it was adopted.
const newsreader = Newsreader({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  style: ["normal", "italic"],
});

// Numbers a tool produces, code samples and the small mono labels. Kept apart
// from the UI face so a total never shifts width while it is being typed.
const geistMono = Geist_Mono({
  variable: "--font-mono-code",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Pulsuz onlayn alətlər — faktura, əmək haqqı, sistem hesabı",
    template: `%s — ${site.shortName}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.author.name, url: site.author.url }],
  creator: site.author.name,
  publisher: site.author.name,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: site.url,
    siteName: site.name,
    title: "Pulsuz onlayn alətlər — faktura, əmək haqqı, sistem hesabı",
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${site.url}/#website`,
      url: `${site.url}/`,
      name: site.name,
      inLanguage: "az-AZ",
      description: site.description,
      publisher: { "@id": `${site.url}/#person` },
    },
    {
      "@type": "Person",
      "@id": `${site.url}/#person`,
      name: site.author.name,
      url: site.author.url,
      jobTitle: "Proqram təminatı üzrə mühəndis",
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="az"
      className={`${inter.variable} ${newsreader.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
