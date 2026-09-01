import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { InvoiceTool } from "@/components/invoice/invoice-tool";
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
    "«Çap et / PDF kimi saxla» düyməsi brauzerin çap pəncərəsini açır; orada printer əvəzinə «PDF kimi saxla» seçilir. Bu yol xüsusi kitabxana tələb etmir və Azərbaycan hərflərini (ə, ğ, ş, ı, ö, ü) həmişə düzgün çıxarır.",
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

export default function FakturaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="no-print border-b border-line bg-subtle">
        <Container className="py-12 sm:py-16">
          <h1 className="max-w-3xl text-[34px] sm:text-[44px]">{tool.title}</h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-8 text-ink-muted">
            Satıcı və alıcı məlumatlarını yaz, sətirləri əlavə et, ƏDV variantını
            seç — sənəd sağda anında yığılır. Məbləğ yazı ilə avtomatik göstərilir,
            heç bir məlumat serverə göndərilmir.
          </p>
        </Container>
      </section>

      <Container className="print-shell py-10 sm:py-14">
        <InvoiceTool />
      </Container>

      <section className="no-print border-t border-line bg-subtle">
        <Container className="py-14">
          <div className="max-w-2xl">
            <h2 className="text-[26px]">Hesab-fakturada nə göstərilir</h2>
            <p className="mt-4 text-[16px] leading-8 text-ink-muted">
              Hesab-faktura ödənişin əsasını göstərən sənəddir: kim, kimə, nəyin
              müqabilində və nə qədər ödəməlidir. Mübahisə yaranmasın deyə sənəddə
              adətən bunlar olur — sənədin nömrəsi və tarixi, tərəflərin adı və
              VÖEN-i, bank rekvizitləri, sətirlərin təsviri, miqdarı və qiyməti,
              ƏDV-nin ayrıca göstərilməsi, ödəniləcək yekun məbləğ və həmin
              məbləğin yazı ilə təkrarı.
            </p>
            <p className="mt-4 text-[16px] leading-8 text-ink-muted">
              Ən çox buraxılan yer bank rekvizitləridir: IBAN və bank kodu
              yazılmayanda alıcının mühasibatlığı ödənişi edə bilmir və sənəd geri
              qayıdır. İkinci yer isə ƏDV-dir — qiymətin ƏDV-li, yoxsa ƏDV-siz
              olduğu yazılmayanda tərəflər fərqli rəqəm başa düşür.
            </p>

            <h2 className="mt-12 text-[26px]">Tez-tez verilən suallar</h2>
            <dl className="mt-6 space-y-6">
              {faq.map(([question, answer]) => (
                <div key={question}>
                  <dt className="text-[16px] font-semibold">{question}</dt>
                  <dd className="mt-2 text-[15px] leading-7 text-ink-muted">
                    {answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>
    </>
  );
}
