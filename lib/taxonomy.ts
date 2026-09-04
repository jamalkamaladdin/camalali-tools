/*
 * The taxonomy, with no tools behind it.
 *
 * Split out of `registry.ts` on purpose: the twelve names are needed by things
 * that must not pull the tool list in with them — the window frame naming the
 * page it is showing, for one, which is a client component and would otherwise
 * ship all sixty-three entries to the browser to print one heading. The
 * registry re-exports everything here, so no call site had to change.
 */
import type { ToolGroup } from "./types";

export type { ToolGroup } from "./types";

export const groupLabels: Record<ToolGroup, string> = {
  biznes: "Biznes və sənəd",
  dizayn: "Dizayn və CSS",
  sistem: "Sistem dizaynı",
  format: "Format və çevirici",
  kod: "Kod və inkişaf",
  metn: "Mətn və məzmun",
  fayl: "Şəkil və fayl",
  seo: "SEO və axtarış",
  shebeke: "Şəbəkə və domen",
  tehlukesizlik: "Təhlükəsizlik",
  cedvel: "Arayış cədvəlləri",
  ekosistem: "Paket və ekosistem",
};

/*
 * One line per category, saying what a visitor finds inside it.
 *
 * It does three jobs at once, which is why it is written once and not three
 * times: it is the line under the category's card on the hub, the lead under
 * the category page's heading, and that page's meta description. So it has to
 * read to somebody who has not opened the page yet — it names the tools rather
 * than praising them.
 */
export const groupDescriptions: Record<ToolGroup, string> = {
  seo: "Meta teqləri, sitemap, robots.txt və kanonik ünvanı qurur. Açar sözləri, linkləri və səhifənin axtarışda görünüşünü yoxlayır.",
  kod: "JWT açır, UUID yaradır, regex sınayır və cron ifadəsini oxuyur. Mətn fərqini göstərir və SQL-i formatlayır.",
  shebeke: "Domenin DNS qeydlərini və tapılan subdomenlərini göstərir. IP alt şəbəkəsini hesablayır.",
  tehlukesizlik: "Parol və hash yaradır. Saytın müdafiə başlıqlarını və parolun məlum sızmalarda olub-olmadığını yoxlayır.",
  cedvel: "Status kodları, HTTP başlıqları, MIME tipləri və portlar üçün arayış verir. Əmrlər, icazələr və simvollar da daxildir.",
  format: "JSON, YAML, Base64, URL kodlaşdırması və ad formatları arasında çevirmə aparır.",
  sistem: "Gündəlik sorğu sayına əsasən RPS, saxlama həcmi və server sayını hesablayır. Baza və arxitektura seçimini göstərir.",
  metn: "Mətnin söz və simvol statistikasını hesablayır. Azərbaycanca nümunə mətn yaradır və başlıqdan slug çıxarır.",
  biznes: "Hesab-faktura hazırlayır, layihənin müddətini qiymətləndirir və valyuta məzənnəsini göstərir.",
  fayl: "Şəkli brauzerdə sıxır və formatını dəyişir. Verilən ünvandan QR kod yaradır.",
  dizayn: "Rəng formatları arasında çevirmə aparır və mətnlə fonun kontrastını ölçür.",
  ekosistem: "npm paketinin versiyasını, ölçüsünü və asılılıqlarını göstərir. GitHub profilinin fəaliyyət məlumatını da alır.",
};

/*
 * The twelve categories, in the order the hub, the tab strip and the file tree
 * print them.
 *
 * Hand-written rather than derived, because the order is an editorial claim and
 * not a fact about the data: the biggest and most obviously sought-after
 * categories come first, so somebody scanning the strip meets `seo` before
 * `dizayn`. Sorting by tool count would look the same today and reorder itself
 * the first time a small category grew.
 *
 * A category key that is missing here is missing from the site — the hub, the
 * routes and the sitemap all walk this array — and the `Record<ToolGroup, …>`
 * maps below are what make forgetting one a compile error.
 */
export const groupOrder: ToolGroup[] = [
  "seo",
  "kod",
  "shebeke",
  "tehlukesizlik",
  "cedvel",
  "format",
  "sistem",
  "metn",
  "biznes",
  "fayl",
  "dizayn",
  "ekosistem",
];

