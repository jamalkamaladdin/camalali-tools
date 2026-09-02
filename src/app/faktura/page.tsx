import type { Metadata } from "next";
import Link from "next/link";
import { InvoiceTool } from "@/components/invoice/invoice-tool";
import { Tabs } from "@/components/tabs";
import {
  Accordion,
  AccordionItem,
  Container,
  PageHead,
  Prose,
} from "@/components/ui";
import { site, toolBySlug, toolUrl } from "@/lib/site";

const tool = toolBySlug("faktura")!;

export const metadata: Metadata = {
  title: tool.title,
  description: tool.description,
  keywords: [...tool.keywords],
  alternates: { canonical: "/faktura/" },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: toolUrl(tool.slug),
    title: `${tool.title} — ${site.shortName}`,
    description: tool.description,
  },
};

const faq: [string, string][] = [
  [
    "Bu faktura rəsmi elektron qaimə sayılırmı?",
    "Xeyr. Elektron qaimə-faktura dövlətin sistemində rəsmiləşdirilir. Buradakı sənəd adi hesab-fakturadır — ödəniş üçün alıcıya göndərilən, müqaviləyə əlavə edilən və mühasibatlıqda istifadə olunan sənəd. Vergi uçotunda qaimə tələb olunursa, onu rəsmi sistemdə tərtib etmək lazımdır.",
  ],
  [
    "ƏDV neçə faiz götürülür?",
    "Standart dərəcə 18%-dir. Alət üç variantı da hesablayır: qiymətin üstünə əlavə olunan ƏDV, qiymətə artıq daxil olan ƏDV və ƏDV tutulmayan hal. Qiymətə daxil olan halda vergi məbləği cəmdən geri çıxarılır — cəm dəyişmir.",
  ],
  [
    "Məbləği yazı ilə göstərmək lazımdırmı?",
    "Azərbaycanda ödəniş sənədlərində məbləğin yazı ilə də göstərilməsi geniş yayılmış tələbdir və rəqəmin sonradan dəyişdirilməsinin qarşısını alır. Alət məbləği avtomatik yazıya çevirir — «min iki yüz otuz dörd manat əlli altı qəpik» formasında.",
  ],
  [
    "Yazdığım məlumatlar harada saxlanılır?",
    "Heç yerdə. Bütün hesablama brauzerdə aparılır, məlumat bu saytın serverinə göndərilmir. Yalnız «yadda saxla» düyməsini basanda satıcı məlumatları həmin brauzerin yaddaşında (localStorage) qalır ki, növbəti dəfə yenidən yazmayasan.",
  ],
  [
    "PDF necə alınır?",
    "«PDF endir» düyməsi sənədi brauzerdə PDF faylına çevirir və endirir. Fayl təmizdir: içində nə bu saytın adı, nə ünvanı, nə də hər hansı reklam olur — yalnız sənin fakturan. Mətn şəkil kimi deyil, əsl mətndir: seçilə, kopyalana və axtarıla bilir, Azərbaycan hərfləri (ə, ğ, ş, ı, ö, ü) düzgün çıxır.",
  ],
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: tool.title,
      url: toolUrl(tool.slug),
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "az-AZ",
      description: tool.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "AZN" },
      author: { "@type": "Person", name: site.author.name, url: site.author.url },
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};

/* The explanation and the FAQ used to be two stacked bg-subtle bands under the
   tool — most of the page's height for material that is read once. They are one
   tab block now. Every panel stays in the served HTML (Tabs only sets `hidden`
   on the inactive one), so the text a search engine reads is unchanged. */
const infoTabs = [
  {
    id: "sened",
    label: "Sənəd haqqında",
    content: (
      <Prose>
        <h2>Hesab-fakturada nə göstərilir</h2>
        <p>
          Hesab-faktura ödənişin əsasını göstərən sənəddir: kim, kimə, nəyin
          müqabilində və nə qədər ödəməlidir. Mübahisə yaranmasın deyə sənəddə
          adətən bunlar olur — sənədin nömrəsi və tarixi, tərəflərin adı və
          VÖEN-i, bank rekvizitləri, sətirlərin təsviri, miqdarı və qiyməti,
          ƏDV-nin ayrıca göstərilməsi, ödəniləcək yekun məbləğ və həmin
          məbləğin yazı ilə təkrarı.
        </p>
        <p>
          Ən çox buraxılan yer bank rekvizitləridir: IBAN və bank kodu
          yazılmayanda alıcının mühasibatlığı ödənişi edə bilmir və sənəd geri
          qayıdır. İkinci yer isə ƏDV-dir — qiymətin ƏDV-li, yoxsa ƏDV-siz
          olduğu yazılmayanda tərəflər fərqli rəqəm başa düşür.
        </p>
      </Prose>
    ),
  },
  {
    id: "suallar",
    label: "Suallar",
    hint: String(faq.length),
    content: (
      <div className="max-w-[68ch]">
        <h2 className="text-[22px] text-ink">Tez-tez verilən suallar</h2>
        {/* group="faq": one answer at a time, which is the browser's own
            exclusive accordion — no JavaScript involved. */}
        <Accordion className="mt-4 border-y border-line">
          {faq.map(([question, answer]) => (
            <AccordionItem key={question} summary={question} group="faq">
              {answer}
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    ),
  },
];

export default function FakturaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* PageHead takes no className, so the print exclusion is carried by the
          wrapper: nothing above the sheet may reach the paper. */}
      <div className="no-print">
        <PageHead
          breadcrumb={
            <>
              <Link
                href="/"
                className="transition-colors hover:text-accent-text"
              >
                {site.shortName}
              </Link>
              <span aria-hidden="true"> / </span>
              <span>{tool.name}</span>
            </>
          }
          title={tool.title}
          lead="Satıcı və alıcı məlumatlarını yaz, sətirləri əlavə et, ƏDV variantını seç — sənəd anında yığılır. Məbləğ yazı ilə avtomatik göstərilir."
          meta="brauzerdə · pulsuz · PDF"
        />
      </div>

      <Container className="print-shell pb-14">
        <InvoiceTool />
      </Container>

      <Container className="no-print pb-16">
        <Tabs items={infoTabs} idPrefix="faktura-info" />
      </Container>
    </>
  );
}
