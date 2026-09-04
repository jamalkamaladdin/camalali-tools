# How to take a tool

This repository holds an exported copy of the tools that run live on
camalali.com/alet. Every tool is built from three separate layers, and the
layers are not equally portable. Taking one of them is a minute's work;
another comes with conditions. Below are the three levels and what each one
needs.

The file names and function signatures in the code samples are real. Nothing
here is invented.

**Bu sənəd iki dildədir. Azərbaycanca tam mətn:
[aşağıdakı bölmə](#azerbaycanca).**

## a) The three levels

| Level | File | What it needs | Who it suits |
|---|---|---|---|
| 1. Logic | `lib/<slug>.ts` | nothing: zero dependencies | anyone moving the computation into their own backend, a CLI, or another framework |
| 2. Widget | `components/<slug>-tool.tsx` | React + Tailwind 4 + the `globals.css` tokens | anyone adding a finished UI card to a Next.js or React site |
| 3. Route | `api/<slug>/route.ts` | Next.js App Router + the safety fences below | anyone running the same network function on their own site: 35 tools only |

Work top down. Each level depends on the one above it and works without the
one below it. A `lib/` file works without `components/`. A `components/` file
works without `api/`. The widget of a network tool is the one that calls the
route.

Besides those three files, every tool has a `tests/<slug>.mts` test. It runs
with `pnpm test`. When you copy a tool, copy its test: it exercises the
functions in the `lib/` file and tells you immediately what broke when the
code changes.

## b) Taking the logic only

This is the simple path: copy one file, call the function. The
`lib/<slug>.ts` files have no React, no DOM and no dependencies (the few
tools using `pdf-lib` or `shiki` are the exception; see section f below).
They behave the same in Node, in Deno, in the browser and in any framework,
because none of them touches `window`, `document` or `fetch`.

`lib/cron.ts`, for instance, is a set of pure functions that parse a cron
expression and work out the next run times:

```ts
import { parseCron, nextRuns } from "./lib/cron.ts";

const result = parseCron("0 9 * * 1-5");
if (result.ok) {
  const { runs } = nextRuns(result.cron, 5, new Date());
  console.log(runs); // the next 5 run times
} else {
  console.error(result.error.message);
}
```

That runs in a terminal under `pnpm dlx tsx`, inside an Express route, and in
a Cloudflare Worker. There is no React or Next.js import anywhere in it. The
same holds for very nearly every `lib/` file: simple types in (string,
number, array), simple types out, pure functions in between.

## c) Taking the widget too

The widget binds the logic in `lib/` to a React component and takes its design
from the `globals.css` tokens and the shared primitives in
`components/ui.tsx`. To run one:

1. **Tailwind 4 has to be installed** (`@tailwindcss/postcss` or Tailwind's
   Vite plugin). The class names (`bg-surface`, `text-ink`, `text-ios-body`)
   are resolved by the `@theme` block in `globals.css`.
2. **`globals.css` has to be in the project's CSS chain.** Colour, radius,
   shadow and focus ring are not written in the component. They are all read
   from variables such as `--surface`, `--ink`, `--accent`, `--field-radius`
   and `--btn-radius`. The file also carries the light and dark theme pair
   (`:root` and `:root[data-theme="dark"]`).
3. **The shared primitives.** Every widget imports from `components/ui.tsx`:
   `ToolButton`, `ToolPanel`, `ToolPanelHeader`, `ToolField`, `ToolInput`,
   `ToolSelect`, `ToolTextArea`, `ToolOutput`, `ToolStat`, `ToolNote`,
   `ToolResultPanel`, `ToolAccordion`. Some also use `ToolTabs` from
   `tabs.tsx`, the table-heavy ones use `ReferenceTable` from
   `reference-table.tsx`, and the ones with `` `code` `` marks in their copy
   use `withInlineCode` from `inline-code.tsx`. Without these the widget will
   not run. It is not standalone; it sits on a shared library.

Copy a widget file on its own and forget `globals.css` and the code still
compiles and the page still opens. Everything just renders with no borders, no
shadows, in system colours. The class names exist, the values behind them do
not, so the build never warns. The only way to see it is to open the page in a
browser.

`pdf-nisan` and `faktura` have a second requirement. Those two fetch
`/fonts/inter-regular.ttf` and `/fonts/inter-semibold.ttf` while drawing text
into a PDF (the reason is in section e: `pdf-lib`'s built-in fonts do not draw
`ə`). Both TTF files are in this repo's `fonts/` folder. When you take those
two tools, copy `fonts/` as well and serve it at the same paths,
`/fonts/inter-regular.ttf` and `/fonts/inter-semibold.ttf`. If the files are
missing, nothing crashes: the request 404s and the PDF comes out either empty
or with an error.

## d) Taking a network tool

These routes send a request from your server to an address outside it. Behind
a visual "check DNS" button, the server makes a call in its own name. Copy one
without its fences and what you have built is not a tool, it is an open proxy:
anyone can use your server to send anonymous requests to somebody else's
address, or to scan your internal network (localhost, the container next door,
the cloud metadata service at `169.254.169.254`). This is not hypothetical. It
is SSRF, a real and common class of vulnerability.

Four files hold that shut, and all of them run **before** `route.ts`:

- **`safe-url.ts` → `normalizeTargetUrl()`**: turns whatever the visitor typed
  into an http/https URL on the standard port 80/443 with no credentials in
  it, or rejects it. Scheme, port and hostname go nowhere until they pass
  through here.
- **`safe-fetch.ts`**: resolves the address approved by `normalizeTargetUrl`
  through DNS first and checks every IP that comes back (if one is public and
  one is private, the whole host is rejected), then calls `fetch` with
  `redirect: "manual"` so a 302 is not followed automatically. Every hop goes
  through `normalizeTargetUrl` and the IP check again by hand. The byte budget
  is here too: the response stream is cut off past a set size, because somebody
  else's server should not get to decide how much memory this process uses.
- **`api-route.ts` → `guard()`**: the rate limit. More than 20 requests a
  minute from one address is rejected (`scope` keeps tools from eating each
  other's counter). It depends on `callerAddress`, `takeBurst` and `tooSoon`
  in `@/lib/rate-limit`, so that file has to come along. The same module
  provides `ok()`, `fail()`, and `upstream()` for requests to services you
  chose, not ones the visitor chose.
- **`api-cache.ts` → `cached()`**: does not ask the same question twice within
  a minute. That is a courtesy to free outside services (certificate logs,
  package registries), but it also takes pressure off the rate limit.
- **`socket-probe.ts`**: for the three tools that open a raw TCP/TLS
  connection (`ssl`, `tls-versiyalari`, `cavab-vaxti`): it validates the
  hostname **as a name** first, so no URL, path or credentials slip through,
  then resolves it through DNS and connects to the resolved IP. It never
  connects to the name itself, and it sends the TLS SNI separately. This is
  what blocks a DNS rebinding attack: a name can return a public IP at
  validation time and a private one at connection time, if a second DNS lookup
  happens in between. Resolving once and connecting to that result closes the
  window.

You cannot delete these files and take `route.ts` alone. The route performs no
checks itself. It calls the functions above at every step, and without them it
either will not compile or, worse, somebody simplifies the calls away by hand
and ends up with an unfenced route. When you take a network tool, take
`lib/safe-url.ts`, `lib/safe-fetch.ts`, `lib/api-route.ts`, `lib/api-cache.ts`
and (only for the raw-socket tools) `lib/socket-probe.ts` as one set. None of
them is optional.

Every network tool's registry entry carries a `network: { upstream, sends }`
field. It is printed on the tool's page so the visitor is told "this sends Y to
X" before they type, because unlike the 131 tools that run in the browser,
these pass what the visitor wrote to a server and on from there. Keep that
disclosure when you copy the tool. An outside request fired off silently is
how you lose a user's trust.

## e) Azerbaijani-language traps

This section is not written down anywhere else. Even if you adapt the code to
another language, it is worth knowing why these five decisions were made. Strip
them blindly and the text quietly breaks while the build and the tests say
nothing.

- **`subsets: ["latin", "latin-ext"]` is mandatory in a `next/font` call.**
  The letters `ə Ə ğ Ğ İ ş Ş` live in U+0100–02BA (Latin Extended-A/B). Pass
  only `"latin"` and those letters fall on a glyph that was never loaded, so
  the browser swaps that one word to a system font mid-sentence. The line then
  reads in two different typefaces. A real example from the project:

  ```ts
  const codeMono = Geist_Mono({
    variable: "--font-web-mono-face",
    subsets: ["latin", "latin-ext"],
    display: "swap",
  });
  ```

- **The web font has to come first in the font stack.** Put the system fonts
  (`-apple-system`, `Segoe UI` and friends) first and the platform tries to
  draw `ə` its own way, and some of them break it. That was measured, not
  guessed. The web font belongs at the head of the stack, with the system
  fonts behind it as a fallback.

- **`toLowerCase()` and `toUpperCase()` give the wrong answer in Azerbaijani.**
  Both JavaScript methods are locale-independent and apply the ASCII rule:
  capital `I` becomes lowercase `i`, lowercase `i` becomes capital `I`. In the
  Azerbaijani alphabet the lowercase of `I` is `ı` and the lowercase of `İ` is
  `i`. The same problem runs in the other direction. You need an override:

  ```ts
  const AZ_LOWER_OVERRIDE: Record<string, string> = { I: "ı", İ: "i" };
  ```

  That pair has to be added to every piece of code that changes letter case:
  spell checking, search, sorting and slug building included.

- **`pdf-lib`'s `StandardFonts` set does not draw `ə`.** The 14 standard fonts
  built into PDF do not reach past Latin-1. Everywhere this project writes text
  containing `ə` into a PDF, a TTF font is embedded with `@pdf-lib/fontkit`:

  ```ts
  import fontkit from "@pdf-lib/fontkit";
  // ...
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(ttfBytes, { subset: true });
  ```

  Replace that with something like `StandardFonts.Helvetica` and the code does
  not break. You get an empty box or an unreadable character instead of `ə`,
  and you only find out by looking at the document that came out. Where the TTF
  bytes come from is answered by the `fonts/` folder in section c.

- **A browser may not have the `az-AZ` locale.** In some environments (mostly
  older ones where Node's ICU is incomplete, and some browser versions)
  `date.toLocaleDateString("az-AZ", ...)` quietly falls back to another locale
  and prints something like `"M08"` in place of the month name. So the date
  format is built from its own helper, with the month and day names written out
  as arrays, rather than trusting the browser's locale support.

## f) What you will have to change

This repo was written for camalali.com, not for your site. When you copy from
it, look at these:

- **The copy is in Azerbaijani.** Every title, explanation, FAQ and error
  message on the tool pages is in Azerbaijani. To translate, find the text
  fields inside `lib/<slug>.ts` (`label`, `note`, `error.message` and so on)
  and change them. The functions themselves do not depend on the language.
- **The links to `camalali.com/alet`.** The `USER_AGENT` string
  (`camalali.com-alet/1.0 (+https://camalali.com/alet)`) is sent with every
  outside request. It is the header that identifies your server, so replace it
  with your own domain: the operator of an outside service needs to know who to
  write to when something goes wrong.
- **`@/lib/rate-limit`.** `guard()` depends on this module, and it is not part
  of this export (it is site-specific infrastructure). Either write your own
  counter or use the simplified version that ships with this export.
- **The registry entry.** Besides `lib/`, `components/` and (where it exists)
  `api/`, a tool is also described in the registry (`name, description,
  keywords, FAQ`). That text is in Azerbaijani too, and fitting it to your own
  catalogue is your job.

---

<a id="azerbaycanca"></a>

# Alətləri necə götürmək

**In English: [the English section is at the top of this file](#how-to-take-a-tool).**

Bu repoda camalali.com/alet-də canlı olan alətlərin ixrac olunmuş nüsxəsi var.
Hər alət üç ayrı qatdan qurulub. Bu qatların daşınıqlığı fərqlidir. Bir qatı
götürmək bir dəqiqəlik işdir, digərində isə əlavə tələblər var. Aşağıda üç
səviyyə və hər birinin necə götürüləcəyi göstərilir.

Real kod nümunələrində fayl adı və funksiyanın imzası düzgündür. Nümunələr
uydurulmayıb.

## a) Üç səviyyə

| Səviyyə | Fayl | Nə lazımdır | Kimə uyğundur |
|---|---|---|---|
| 1. Məntiq | `lib/<slug>.ts` | heç nə: sıfır asılılıq | öz backend-inə, CLI-yə, başqa freymvorka hesablama məntiqini aparmaq istəyən |
| 2. Widget | `components/<slug>-tool.tsx` | React + Tailwind 4 + `globals.css` tokenləri | Next.js/React saytına hazır UI kartı əlavə etmək istəyən |
| 3. Marşrut | `api/<slug>/route.ts` | Next.js App Router + təhlükəsizlik hasarları (aşağıda) | öz saytında eyni şəbəkə funksiyasını sürmək istəyən: yalnız 35 alət üçün |

Yuxarıdan aşağı get: hər səviyyə özündən əvvəlkindən asılıdır, amma özündən
sonrakı olmadan da təkbaşına işləyir. `lib/` faylı `components/`-suz da
işləyir. `components/` faylı `api/`-siz də işləyir. Network alətlərinin
widget-i isə marşrutu çağırır.

Hər alətin bu üç fayldan başqa bir də `tests/<slug>.mts` testi var. Test
`pnpm test` ilə işə düşür. Aləti öz layihənə köçürəndə testi də köçür: `lib/`
faylının funksiyalarını sınayır, kod dəyişəndə nəyin sındığını dərhal göstərir.

## b) Yalnız məntiqi götürmək

Ən sadə yol budur: bir faylı kopyala, funksiyanı çağır. `lib/<slug>.ts`
faylları React-siz, DOM-suz və asılılıqsızdır (yalnız `pdf-lib`/`shiki`
işlədən bir neçə alət istisnadır; aşağıdakı f) bölməsinə bax). Node-da,
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

Bu, `pnpm dlx tsx` ilə terminalda, bir Express marşrutunun içində və bir
Cloudflare Worker-də işləyir. Heç bir React və ya Next.js importu yoxdur.
Eyni qayda demək olar hər `lib/` faylı üçün keçərlidir: giriş sadə tip
(sətir, ədəd, massiv), çıxış sadə tip, aradakı hər şey saf funksiya.

## c) Widget-i də götürmək

Widget `lib/`-dəki məntiqi React komponentinə bağlayır və dizaynı `globals.css`
tokenlərindən, ortaq primitivlərdən (`components/ui.tsx`) götürür. Bunu
işlətmək üçün:

1. Tailwind 4 quraşdırılmış olmalıdır (`@tailwindcss/postcss` və ya
   Tailwind-in Vite plagini). Sinif adları (`bg-surface`, `text-ink`,
   `text-ios-body`) `globals.css`-dəki `@theme` bloku ilə tanınır.
2. `globals.css` layihənin CSS zəncirinə daxil edilməlidir. Rəng, radius,
   kölgə və fokus halqası komponentin özündə yazılmır.
   Hamısı `--surface`, `--ink`, `--accent`, `--field-radius`, `--btn-radius`
   kimi dəyişənlərdən oxunur. Fayl açıq/tünd tema cütünü də daşıyır
   (`:root` və `:root[data-theme="dark"]`).
3. Ortaq primitivlər. Hər widget `components/ui.tsx`-dən import edir:
   `ToolButton`, `ToolPanel`, `ToolPanelHeader`, `ToolField`, `ToolInput`,
   `ToolSelect`, `ToolTextArea`, `ToolOutput`, `ToolStat`, `ToolNote`,
   `ToolResultPanel`, `ToolAccordion`. Bir neçəsi bundan əlavə `tabs.tsx`-dən
   `ToolTabs`-i, uzun cədvəlli alətlər `reference-table.tsx`-dən
   `ReferenceTable`-i, mətndə `` `kod` `` işarəsi olan alətlər isə
   `inline-code.tsx`-dən `withInlineCode`-u işlədir. Bunları da köçürmədən
   widget-i işə salmaq olmaz. O, standalone deyil, ortaq kitabxananın
   üstündə qurulub.

Widget faylını təkbaşına köçürüb `globals.css`-i unutsan, kod xətasız compile
olur və səhifə açılır. Amma hər şey kənarlıqsız, kölgəsiz,
sistem rənglərində görünür. Sinif adları mövcuddur, amma arxasındakı dəyər
yoxdur, ona görə build heç vaxt xəbərdarlıq vermir. Bunu görməyin yeganə yolu
brauzerdə açıb baxmaqdır.

Yalnız `pdf-nisan` və `faktura` üçün ikinci tələb var. Bu iki alət PDF-in
içinə mətn çəkərkən `/fonts/inter-regular.ttf` və `/fonts/inter-semibold.ttf`
fayllarını gətirir (səbəbi e) bölməsindədir: `pdf-lib`-in daxili
şriftləri `ə` çəkmir). Bu iki TTF faylı bu repoda `fonts/` qovluğundadır. Bu
iki aləti götürəndə `fonts/` qovluğunu da köçür və öz saytında eyni yollardan
`/fonts/inter-regular.ttf`, `/fonts/inter-semibold.ttf` açıq ver. Fayllar
əskik olsa kod sınmır, sorğu 404 qaytarır və PDF ya boş çıxır, ya da xəta ilə
dayanır.

## d) Şəbəkə alətini götürmək

Bu marşrutlar sənin serverindən kənar ünvana sorğu göndərir. Vizual bir "DNS
yoxla" düyməsinin arxasında server öz adına
bir sorğu atır. Hasarsız köçürsən, tikdiyin şey alət yox, açıq proksidir:
kim istəsə sənin serverini istifadə edib özgə ünvana anonim sorğu göndərə
bilər, ya da onu sənin daxili şəbəkəni (localhost, konteynerin qonşusu,
bulud metadata xidməti `169.254.169.254`) taramaq üçün işlədə bilər. Bu, fərziyyə
deyil. Bu, SSRF adlanan, real və tez-tez rast gəlinən zəiflik sinfidir.

Bunu qeyd-şərtsiz açan dörd fayl var, hamısı `route.ts`-dən **əvvəl** işə
düşür:

- **`safe-url.ts` → `normalizeTargetUrl()`**: ziyarətçinin yazdığı mətni
  http/https-ə, standart 80/443 portuna, kimlik məlumatı olmayan bir URL-ə
  çevirir və ya rədd edir. Sxem, port, host adı buradan keçmədən heç yerə
  getmir.
- **`safe-fetch.ts`**: `normalizeTargetUrl` ilə təsdiqlənmiş ünvanı əvvəlcə
  DNS ilə həll edir və qayıdan hər IP-ni yoxlayır (bir açıq, bir gizli
  cavab olsa, bütün host rədd edilir), sonra `fetch`-i `redirect: "manual"`
  ilə çağırır ki, 302 avtomatik izlənməsin. Hər hop əl ilə yenidən
  `normalizeTargetUrl` və IP yoxlamasından keçir. Bayt büdcəsi də buradadır:
  cavab axını müəyyən ölçüdən sonra kəsilir, çünki özgə server bu prosesin
  yaddaşına nə qədər yer tutacağına qərar verməməlidir.
- **`api-route.ts` → `guard()`**: sürət həddi. Eyni ünvandan dəqiqədə 20
  sorğudan çoxu rədd edilir (`scope` ilə alətlər bir-birinin sayğacını
  yemir). Bu, `@/lib/rate-limit`-dəki `callerAddress`/`takeBurst`/`tooSoon`
  funksiyalarına bağlıdır. Həmin fayl da köçməlidir. Eyni modul `ok()`,
  `fail()` və sənin özün seçdiyin (ziyarətçi seçmədiyi) xarici xidmətlərə
  sorğu üçün `upstream()` funksiyalarını verir.
- **`api-cache.ts` → `cached()`**: eyni sorğunu bir dəqiqə ərzində təkrar
  soruşmur; xarici pulsuz xidmətə (sertifikat jurnalı, paket reyestri) hörmət
  məsələsidir, amma sürət həddini də yumşaldır.
- **`socket-probe.ts`**: xam TCP/TLS açan üç alət üçün (`ssl`, `tls-versiyalari`,
  `cavab-vaxti` kimi): host adını əvvəlcə **ad kimi** yoxlayır (URL, yol,
  kimlik məlumatı keçirməsin deyə), sonra DNS ilə həll edir və həll olunmuş
  IP-yə qoşulur. Adın özünə qoşulmur və TLS SNI-ni ayrıca göndərir. Bu, DNS
  rebind hücumunun qarşısını alır: ad yoxlama anında açıq IP, qoşulma
  anında isə gizli IP qaytara bilər, əgər aralarında ikinci bir DNS sorğusu
  aparılsa. Bir dəfə həll edib elə ona qoşulmaq bu pəncərəni bağlayır.

Bu faylları silib yalnız `route.ts`-i götürmək olmaz. Marşrut özü heç bir
yoxlama aparmır. O, hər addımda yuxarıdakı funksiyaları çağırır və onlar
yoxdursa ya kompil olmaz, ya da (daha pisi) kimsə həmin çağırışları əlində
sadələşdirib silər və hasarsız marşrut yaza bilər. Şəbəkə alətini götürəndə
`lib/safe-url.ts`, `lib/safe-fetch.ts`, `lib/api-route.ts`, `lib/api-cache.ts`
və (yalnız xam soket işlədən alətlər üçün) `lib/socket-probe.ts` bir dəstə
kimi köçür. Heç biri əskik olmamalıdır.

Hər network alətinin reyestr girişində `network: { upstream, sends }` sahəsi
var. Bu, alətin səhifəsində ziyarətçiyə "bu, X ünvanına Y göndərir" deyə açıq
yazılır, çünki brauzerdə işləyən 131 alətdən fərqli olaraq bunlar ziyarətçinin
yazdığını serverə, oradan da kənara ötürür. Öz saytına köçürəndə bu izahı da
saxla. Sükutla işə salınan xarici sorğu istifadəçinin etibarını qırır.

## e) Azərbaycan dili tələləri

Bu bölmə başqa yerdə yazılmayıb. Kodu başqa dilə uyğunlaşdırsan belə,
aşağıdakı beş qərarın səbəbini bilmək lazımdır.
kor-koranə silsən, mətn səssizcə xarab olar, build və ya test heç nə demədən
keçər.

- **`next/font` çağırışında `subsets: ["latin", "latin-ext"]` məcburidir.**
  `ə Ə ğ Ğ İ ş Ş` hərfləri Unicode-un U+0100–02BA aralığındadır (Latin
  Extended-A/B). Yalnız `"latin"` versəsən, bu hərflər cümlənin ortasında
  yükdə olmayan glifə düşür və brauzer o sözü sistem şriftinə keçirir. Sətir
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
  `ə`-ni öz üsulu ilə çəkməyə çalışır və bəzilərində sındırır. Bu ölçülüb,
  fərziyyə deyil. Veb şrift yığının başında olmalıdır, sistem şriftləri onun
  arxasında ehtiyat kimi qalmalıdır.

- **`toLowerCase()`/`toUpperCase()` azərbaycanca üçün səhv nəticə verir.**
  JavaScript-in bu iki metodu lokaldan asılı deyil və ASCII qaydasını
  işlədir: böyük `I`-ni kiçik `i`-yə, kiçik `i`-ni böyük `I`-yə çevirir. Amma
  azərbaycan əlifbasında `I`-nin kiçiyi `ı`-dır, `İ`-nin kiçiyi isə `i`-dir.
  Əks istiqamətdə də eyni problem var. Örtmə lazımdır:

  ```ts
  const AZ_LOWER_OVERRIDE: Record<string, string> = { I: "ı", İ: "i" };
  ```

  Bu cütü hər yerdə hərf çevirən kod üçün əlavə etmək lazımdır: orfoqrafiya
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

  `StandardFonts.Helvetica` kimi bir şeylə əvəz etsən, kod sınmır. `ə`
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

- **Mətn azərbaycancadır.** Alət səhifələrindəki başlıq, izah, FAQ və xəta
  mesajlarının hamısı AZ-dır. Başqa dilə çevirmək istəsən, `lib/<slug>.ts`
  içindəki mətn sahələrini (`label`, `note`, `error.message` və s.) tap və
  dəyiş. Funksiyaların özü dildən asılı deyil.
- **`camalali.com/alet`-ə keçidlər.** `USER_AGENT` sətri (`camalali.com-alet/1.0
  (+https://camalali.com/alet)`) hər xarici sorğuda göndərilir. Bu, sənin
  serverini tanıdan başlıqdır, öz domeninlə əvəz et ki, xarici xidmətin
  operatoru problem olanda kimə yazacağını bilsin.
- **`@/lib/rate-limit`.** `guard()` bu modula bağlıdır və o, bu ixracın
  daxilində deyil (site-ə xas infrastrukturdur). Öz sayğacını yazmalı, ya da
  bu ixracla gələn sadələşdirilmiş versiyanı işlətməlisən.
- **Reyestr girişi.** Bir alət `lib/`, `components/`, (varsa) `api/`-dən
  başqa, bir də reyestrdə (`ad, təsvir, açar sözlər, FAQ`) təsvir olunur.
  o mətn də AZ-dır və öz kataloquna uyğunlaşdırmaq sənin işindir.
