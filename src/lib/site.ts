/**
 * Single source of truth for site-wide values and the tool registry.
 * Routes, the home page, the sitemap and structured data all read from here —
 * adding a tool means adding one entry plus its route folder.
 */

export const site = {
  name: "Camal Əli · Alətlər",
  shortName: "Alətlər",
  url: "https://tools.camalali.com",
  locale: "az_AZ",
  lang: "az",
  description:
    "Azərbaycan üçün pulsuz onlayn alətlər: hesab-faktura hazırlamaq, əmək haqqı hesablamaq və sistem layihələndirmə. Məlumat brauzerdən çıxmır.",
  author: {
    name: "Camal Əli",
    url: "https://camalali.com",
    about: "https://camalali.com/haqqimda",
    services: "https://camalali.com/xidmetler",
    blog: "https://camalali.com/bloq",
  },
} as const;

export type ToolAudience = "biznes" | "developer";
export type ToolStatus = "live" | "planned";

export type Tool = {
  slug: string;
  /** Short name used in navigation and cards. */
  name: string;
  /** Full H1 / page title — carries the search phrase. */
  title: string;
  /** One line under the card and in the meta description. */
  tagline: string;
  description: string;
  audience: ToolAudience;
  status: ToolStatus;
  /** Search phrases this page is written for. */
  keywords: string[];
};

export const tools: Tool[] = [
  {
    slug: "faktura",
    name: "Faktura",
    title: "Hesab-faktura generatoru",
    tagline: "Sətirləri yaz, ƏDV-ni seç, PDF-i endir.",
    description:
      "Onlayn hesab-faktura hazırla: satıcı və alıcı məlumatları, VÖEN, IBAN, ƏDV və məbləğin yazı ilə göstərilməsi. PDF brauzerdə yaradılır, məlumat serverə göndərilmir.",
    audience: "biznes",
    status: "live",
    keywords: [
      "hesab faktura",
      "faktura nümunəsi",
      "onlayn faktura",
      "invoice azərbaycan",
      "faktura forması",
    ],
  },
  {
    slug: "emek-haqqi",
    name: "Əmək haqqı",
    title: "Əmək haqqı kalkulyatoru",
    tagline: "Gross-dan net-ə və əksinə — tutulmaların hamısı ayrıca.",
    description:
      "Əmək haqqından tutulmaları hesabla: gəlir vergisi, sosial sığorta, işsizlikdən sığorta və icbari tibbi sığorta. Həm gross-dan net-ə, həm də net-dən gross-a.",
    audience: "biznes",
    status: "planned",
    keywords: [
      "əmək haqqı kalkulyatoru",
      "net maaş hesablama",
      "gross net hesablama",
      "maaşdan tutulmalar",
      "vergi kalkulyatoru",
    ],
  },
  {
    slug: "miqyas",
    name: "Miqyas",
    title: "Yük və miqyas kalkulyatoru",
    tagline: "Gündəlik sorğu sayından RPS, saxlama və server sayına.",
    description:
      "Gündəlik sorğu sayı, orta sənəd ölçüsü və saxlama müddətindən RPS, pik yük, aylıq trafik və təxmini node sayını hesablayır — sistem layihələndirməsinin ilk hesabı.",
    audience: "developer",
    status: "planned",
    keywords: [
      "rps hesablama",
      "back of the envelope",
      "capacity planning",
      "sistem dizaynı hesabı",
    ],
  },
  {
    slug: "arxitektura",
    name: "Arxitektura",
    title: "Arxitektura seçim köməkçisi",
    tagline: "Bir neçə sual — tarazlı tövsiyə və onun səbəbi.",
    description:
      "Yükünü, komanda ölçünü və məhdudiyyətlərini təsvir et: hansı verilənlər bazasının, keş qatının və yerləşdirmə modelinin sənin halına uyğun olduğunu səbəbi ilə göstərir.",
    audience: "developer",
    status: "planned",
    keywords: [
      "hansı verilənlər bazası",
      "arxitektura seçimi",
      "postgres yoxsa mongodb",
      "sistem dizaynı",
    ],
  },
];

export const liveTools = () => tools.filter((t) => t.status === "live");
export const toolBySlug = (slug: string) => tools.find((t) => t.slug === slug);
export const toolPath = (slug: string) => `/${slug}/`;
export const toolUrl = (slug: string) => `${site.url}${toolPath(slug)}`;
