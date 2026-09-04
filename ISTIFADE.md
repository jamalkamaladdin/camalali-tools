# Alətləri necə götürmək

Bu repoda camalali.com/alet-də canlı olan alətlərin ixrac olunmuş nüsxəsi var.
Hər alət üç ayrı qatdan qurulub, və bu üç qatın **daşınıqlığı fərqlidir** —
bir qatı götürmək bir dəqiqəlik iş, o birini götürmək bir tələdir. Bu sənəd
əvvəlcə üç səviyyəni ayırır, sonra hər birini necə götürəcəyini göstərir.

Real kod nümunəsi işlədən hər yerdə faylın adı və funksiyanın imzası
düzgündür — özün yoxlaya bilərsən. Nümunə uydurulmayıb.

## a) Üç səviyyə

| Səviyyə | Fayl | Nə lazımdır | Kimə uyğundur |
|---|---|---|---|
| 1. Məntiq | `lib/<slug>.ts` | heç nə — sıfır asılılıq | öz backend-inə, CLI-yə, başqa freymvorka hesablama məntiqini aparmaq istəyən |
| 2. Widget | `components/<slug>-tool.tsx` | React + Tailwind 4 + `globals.css` tokenləri | Next.js/React saytına hazır UI kartı əlavə etmək istəyən |
| 3. Marşrut | `api/<slug>/route.ts` | Next.js App Router + təhlükəsizlik hasarları (aşağıda) | öz saytında **eyni** şəbəkə funksiyasını sürmək istəyən — yalnız 34 alət üçün |

Yuxarıdan aşağı get: hər səviyyə özündən əvvəlkindən asılıdır, amma özündən
sonrakı olmadan da tək başına işləyir. `lib/` faylı `components/`-suz da
işləyir; `components/` faylı `api/`-siz də işləyir (network alətləri istisna —
onların widget-i marşrutu çağırır).

Hər alətin bu üç fayldan başqa bir də `tests/<slug>.mts` testi var —
`pnpm test` ilə işə düşür. Aləti öz layihənə köçürəndə testi də köçür: `lib/`
faylının funksiyalarını sınayır, kod dəyişəndə nəyin sındığını dərhal göstərir.

## b) Yalnız məntiqi götürmək

Ən sadə yol budur: bir faylı kopyala, funksiyanı çağır. `lib/<slug>.ts`
faylları React-siz, DOM-suz və asılılıqsızdır (yalnız `pdf-lib`/`shiki`
işlədən bir neçə alət istisnadır — aşağıdakı **f)** bölməsinə bax). Node-da,
Deno-da, brauzerdə, hər hansı freymvorkda eyni cür işləyir, çünki heç biri
`window`, `document` və ya `fetch`-ə toxunmur.

Məsələn `lib/cron.ts` cron ifadəsini oxuyan və növbəti icra vaxtlarını
hesablayan təmiz funksiyalardır:

```ts
import { parseCron, nextRuns } from "./lib/cron.ts";

const result = parseCron("0 9 * * 1-5");
if (result.ok) {
  const { runs } = nextRuns(result.cron, 5, new Date());
  console.log(runs); // növbəti 5 icra vaxtı
} else {
  console.error(result.error.message);
}
```

Bu, `pnpm dlx tsx` ilə terminalda da işləyir, bir Express marşrutunun içində
də, bir Cloudflare Worker-də də — heç bir React və ya Next.js importu yoxdur.
Eyni qayda demək olar hər `lib/` faylı üçün keçərlidir: giriş sadə tip
(sətir, ədəd, massiv), çıxış sadə tip, aradakı hər şey saf funksiya.

## c) Widget-i də götürmək

Widget `lib/`-dəki məntiqi React komponentinə bağlayır və dizaynı `globals.css`
tokenlərindən, ortaq primitivlərdən (`components/ui.tsx`) götürür. Bunu
işlətmək üçün:

1. **Tailwind 4** quraşdırılmış olmalıdır (`@tailwindcss/postcss` və ya
   Tailwind-in Vite plagini) — sinif adları (`bg-surface`, `text-ink`,
   `text-ios-body`) `globals.css`-dəki `@theme` bloku ilə tanınır.
2. **`globals.css` layihənin CSS zəncirinə daxil edilməlidir.** Rəng, radius,
   kölgə, fokus halqası — bunların heç biri komponentin özündə yazılmır,
   hamısı `--surface`, `--ink`, `--accent`, `--field-radius`, `--btn-radius`
   kimi dəyişənlərdən oxunur. Fayl açıq/tünd tema cütünü də daşıyır
   (`:root` və `:root[data-theme="dark"]`).
3. **Ortaq primitivlər.** Hər widget `components/ui.tsx`-dən import edir:
   `ToolButton`, `ToolPanel`, `ToolPanelHeader`, `ToolField`, `ToolInput`,
   `ToolSelect`, `ToolTextArea`, `ToolOutput`, `ToolStat`, `ToolNote`,
   `ToolResultPanel`, `ToolAccordion`. Bir neçəsi bundan əlavə `tabs.tsx`-dən
   `ToolTabs`-i, uzun cədvəlli alətlər `reference-table.tsx`-dən
   `ReferenceTable`-i, mətndə `` `kod` `` işarəsi olan alətlər isə
   `inline-code.tsx`-dən `withInlineCode`-u işlədir. Bunları da köçürmədən
   widget-i işə salmaq olmaz — o, standalone deyil, ortaq kitabxananın
   üstündə qurulub.

**Tələ:** widget faylını təkbaşına köçürüb `globals.css`-i unutsan, kod
xətasız compile olur və səhifə açılır — amma hər şey kənarlıqsız, kölgəsiz,
sistem rənglərində görünür. Sinif adları mövcuddur, amma arxasındakı dəyər
yoxdur, ona görə build heç vaxt xəbərdarlıq vermir. Bunu görməyin yeganə yolu
brauzerdə açıb baxmaqdır.

**İkinci tələ, yalnız `pdf-nisan` və `faktura` üçün:** bu iki alət PDF-in
içinə mətn çəkərkən `/fonts/inter-regular.ttf` və `/fonts/inter-semibold.ttf`
fayllarını gətirir (səbəbi **e)** bölməsindədir — `pdf-lib`-in daxili
şriftləri `ə` çəkmir). Bu iki TTF faylı bu repoda `fonts/` qovluğundadır. Bu
iki aləti götürəndə `fonts/` qovluğunu da köçür və öz saytında eyni yoldan —
`/fonts/inter-regular.ttf`, `/fonts/inter-semibold.ttf` — açıq ver. Fayllar
əskik olsa kod sınmır, sorğu 404 qaytarır və PDF ya boş çıxır, ya da xəta ilə
dayanır.

## d) Şəbəkə alətini götürmək

**Xəbərdarlıq əvvəlcə:** bu marşrutlar sənin serverindən **kənar ünvana
sorğu göndərir** — vizual bir "DNS yoxla" düyməsinin arxasında server öz adına
bir sorğu atır. Hasarsız köçürsən, tikdiyin şey alət yox, **açıq proksidir**:
kim istəsə sənin serverini istifadə edib özgə ünvana anonim sorğu göndərə
bilər, ya da onu sənin daxili şəbəkəni (localhost, konteynerin qonşusu,
bulud metadata xidməti `169.254.169.254`) taramaq üçün işlədə bilər. Bu, fərziyyə
deyil — SSRF adlanan, real və tez-tez rast gəlinən zəiflik sinfidir.

Bunu qeyd-şərtsiz açan dörd fayl var, hamısı `route.ts`-dən **əvvəl** işə
düşür:

- **`safe-url.ts` → `normalizeTargetUrl()`** — ziyarətçinin yazdığı mətni
  http/https-ə, standart 80/443 portuna, kimlik məlumatı olmayan bir URL-ə
  çevirir və ya rədd edir. Sxem, port, host adı buradan keçmədən heç yerə
  getmir.
- **`safe-fetch.ts`** — `normalizeTargetUrl` ilə təsdiqlənmiş ünvanı əvvəlcə
  DNS ilə həll edir və qayıdan **hər** IP-ni yoxlayır (bir açıq, bir gizli
  cavab olsa, bütün host rədd edilir), sonra `fetch`-i `redirect: "manual"`
  ilə çağırır ki, 302 avtomatik izlənməsin — hər hop əl ilə yenidən
  `normalizeTargetUrl` və IP yoxlamasından keçir. Bayt büdcəsi də buradadır:
  cavab axını müəyyən ölçüdən sonra kəsilir, çünki özgə server bu prosesin
  yaddaşına nə qədər yer tutacağına qərar verməməlidir.
- **`api-route.ts` → `guard()`** — sürət həddi: eyni ünvandan dəqiqədə 20
  sorğudan çoxu rədd edilir (`scope` ilə alətlər bir-birinin sayğacını
  yemir). Bu, `@/lib/rate-limit`-dəki `callerAddress`/`takeBurst`/`tooSoon`
  funksiyalarına bağlıdır — həmin fayl da köçməlidir. Eyni modul `ok()`,
  `fail()` və sənin özün seçdiyin (ziyarətçi seçmədiyi) xarici xidmətlərə
  sorğu üçün `upstream()` funksiyalarını verir.
- **`api-cache.ts` → `cached()`** — eyni sorğunu bir dəqiqə ərzində təkrar
  soruşmur; xarici pulsuz xidmətə (sertifikat jurnalı, paket reyestri) hörmət
  məsələsidir, amma sürət həddini də yumşaldır.
- **`socket-probe.ts`** — xam TCP/TLS açan üç alət üçün (`ssl`, `tls-versiyalari`,
  `cavab-vaxti` kimi): host adını əvvəlcə **ad kimi** yoxlayır (URL, yol,
  kimlik məlumatı keçirməsin deyə), sonra DNS ilə həll edir, **həll olunmuş
  IP-yə** qoşulur — adın özünə yox — və TLS SNI-ni ayrıca göndərir. Bu, DNS
  rebind hücumunun qarşısını alır: ad yoxlama anında açıq IP, qoşulma
  anında isə gizli IP qaytara bilər, əgər aralarında ikinci bir DNS sorğusu
  aparılsa. Bir dəfə həll edib elə ona qoşulmaq bu pəncərəni bağlayır.

**Bu faylları silib yalnız `route.ts`-i götürmək olmaz.** Marşrut özü heç bir
yoxlama aparmır — o, hər addımda yuxarıdakı funksiyaları çağırır və onlar
yoxdursa ya kompil olmaz, ya da (daha pisi) kimsə həmin çağırışları əlində
sadələşdirib silər və hasarsız marşrut yaza bilər. Şəbəkə alətini götürəndə
`lib/safe-url.ts`, `lib/safe-fetch.ts`, `lib/api-route.ts`, `lib/api-cache.ts`
və (yalnız xam soket işlədən alətlər üçün) `lib/socket-probe.ts` bir dəstə
kimi köçür — heç biri əskik olmadan.

Hər network alətinin reyestr girişində `network: { upstream, sends }` sahəsi
var — bu, alətin səhifəsində ziyarətçiyə "bu, X ünvanına Y göndərir" deyə açıq
yazılır, çünki brauzerdə işləyən 131 alətdən fərqli olaraq bunlar ziyarətçinin
yazdığını serverə, oradan da kənara ötürür. Öz saytına köçürəndə bu izahı da
saxla — sükutla işə salınan xarici sorğu istifadəçinin etibarını qırır.

## e) Azərbaycan dili tələləri

Bu bölmə başqa yerdə yazılmayıb, ona görə ən dəyərli hissədir. Kodu başqa
dilə uyğunlaşdırsan belə, aşağıdakı beş qərarın **səbəbini** bilmək lazımdır —
kor-koranə silsən, mətn səssizcə xarab olar, build və ya test heç nə demədən
keçər.

- **`next/font` çağırışında `subsets: ["latin", "latin-ext"]` məcburidir.**
  `ə Ə ğ Ğ İ ş Ş` hərfləri Unicode-un U+0100–02BA aralığındadır (Latin
  Extended-A/B). Yalnız `"latin"` versəsən, bu hərflər cümlənin ortasında
  yükdə olmayan glifə düşür və brauzer o sözü sistem şriftinə keçirir — sətir
  boyu iki fərqli şriftlə qarışıq görünür. Layihədə real nümunə:

  ```ts
  const codeMono = Geist_Mono({
    variable: "--font-web-mono-face",
    subsets: ["latin", "latin-ext"],
    display: "swap",
  });
  ```

- **Şrift yığınında veb şrift birinci gəlməlidir.** Sistem şriftlərini
  (`-apple-system`, `Segoe UI` və s.) birinci qoysan, işlətdiyin platforma
  `ə`-ni öz üsulu ilə çəkməyə çalışır və bəzilərində sındırır — bu ölçülüb,
  fərziyyə deyil. Veb şrift yığının başında olmalıdır, sistem şriftləri onun
  arxasında ehtiyat kimi qalmalıdır.

- **`toLowerCase()`/`toUpperCase()` azərbaycanca üçün səhv nəticə verir.**
  JavaScript-in bu iki metodu lokaldan asılı deyil və ASCII qaydasını
  işlədir: böyük `I`-ni kiçik `i`-yə, kiçik `i`-ni böyük `I`-yə çevirir. Amma
  azərbaycan əlifbasında `I`-nin kiçiyi `ı`-dır, `İ`-nin kiçiyi isə `i`-dir —
  əks istiqamətdə də eyni problem var. Örtmə lazımdır:

  ```ts
  const AZ_LOWER_OVERRIDE: Record<string, string> = { I: "ı", İ: "i" };
  ```

  Bu cütü hər yerdə hərf çevirən kod üçün əlavə etmək lazımdır — orfoqrafiya
  yoxlaması, axtarış, sıralama, slug qurma daxil.

- **`pdf-lib`-in `StandardFonts` dəsti `ə` hərfini çəkmir.** PDF-in daxili
  14 standart şrifti Latin-1-dən kənara çıxmır. Bu layihədə `ə/ə` hərfi olan
  mətn PDF-ə yazılan hər yerdə TTF şrift `@pdf-lib/fontkit` ilə əlavədən
  yerləşdirilir:

  ```ts
  import fontkit from "@pdf-lib/fontkit";
  // ...
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(ttfBytes, { subset: true });
  ```

  `StandardFonts.Helvetica` kimi bir şeylə əvəz etsən, kod sınmır — `ə`
  yerinə boş qutu və ya oxunmaz simvol çıxır, bunu yalnız çıxan sənədə
  baxanda görürsən. TTF baytları haradan gəlir sualının cavabı **c)**
  bölməsindəki `fonts/` qovluğudur.

- **Brauzerdə `az-AZ` lokalı olmaya bilər.** `date.toLocaleDateString("az-AZ",
  ...)` bəzi mühitlərdə (əsasən Node ICU-nun tam olmadığı köhnə mühitlər və
  bəzi brauzer versiyaları) sükutla başqa lokala düşür və ay adı yerinə
  `"M08"` kimi bir şey çıxarır. Ona görə tarix formatı öz köməkçisindən
  (ay/gün adları əl ilə yazılmış massivlər) qurulur, brauzerin lokal
  dəstəyinə etibar edilmir.

## f) Nəyi dəyişmək lazım gələcək

Bu repo camalali.com üçün yazılıb, sənin saytın üçün yox. Köçürəndə bunlara
bax:

- **Mətn azərbaycancadır.** Alət səhifələrindəki başlıq, izah, FAQ, xəta
  mesajları — hamısı AZ. Başqa dilə çevirmək istəsən, `lib/<slug>.ts`
  içindəki mətn sahələrini (`label`, `note`, `error.message` və s.) tap və
  dəyiş — funksiyaların özü dildən asılı deyil.
- **`camalali.com/alet`-ə keçidlər.** `USER_AGENT` sətri (`camalali.com-alet/1.0
  (+https://camalali.com/alet)`) hər xarici sorğuda göndərilir — bu, sənin
  serverini tanıdan başlıqdır, öz domeninlə əvəz et ki, xarici xidmətin
  operatoru problem olanda kimə yazacağını bilsin.
- **`@/lib/rate-limit`.** `guard()` bu modula bağlıdır və o, bu ixracın
  daxilində deyil (site-ə xas infrastrukturdur) — öz sayğacını yazmalı, ya da
  bu ixracla gələn sadələşdirilmiş versiyanı işlətməlisən.
- **Reyestr girişi.** Bir alət `lib/`, `components/`, (varsa) `api/`-dən
  başqa, bir də reyestrdə (`ad, təsvir, açar sözlər, FAQ`) təsvir olunur —
  o mətn də AZ-dır və öz kataloquna uyğunlaşdırmaq sənin işindir.
