# camalali-tools

165 kiçik alət — JWT açmaqdan DNS yoxlamasına, hash hesablamaqdan hesab-fakturaya qədər. Hər biri camalali.com üçün yazılıb, buraya öz mənbəyindən **generasiya olunub**: kod eynidir, sadəcə saytın pəncərə sistemindən ayrılıb.

![alət](https://img.shields.io/badge/al%C9%99t-165-3584e4) ![kateqoriya](https://img.shields.io/badge/kateqoriya-12-3584e4) ![test halı](https://img.shields.io/badge/test_hal%C4%B1-2318%2B-12a5a5) ![asılılıqsız](https://img.shields.io/badge/as%C4%B1l%C4%B1l%C4%B1qs%C4%B1z-159_al%C9%99t-6c5ce7) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![lisenziya](https://img.shields.io/badge/lisenziya-MIT-2ec27e)

![](assets/hero.gif)

**Canlı nümunə:** hər alətin işlək halını burada gör → **https://camalali.com/alet**

## Sürətli başlanğıc

`lib/cron.ts` faylını öz layihənə köçür, idxal et, çağır — üçüncü tərəf asılılığı yoxdur:

```ts
import { parseCron, describeCron } from "./lib/cron";

const cron = parseCron("*/15 9-17 * * 1-5");
if (cron.ok) console.log(describeCron(cron.cron));
```

## Nümunələr

<table>
<tr>
  <td width="50%">
    <img src="assets/demo-qradient.gif" width="100%" alt="Gradient qurucusu demosu" /><br />
    <b>Gradient qurucusu</b> — Dayanacaqları düz, kodu bir kliklə götür.<br />
    <a href="https://camalali.com/alet/qradient">alətə bax →</a>
  </td>
  <td width="50%">
    <img src="assets/demo-qr.gif" width="100%" alt="QR kod generatoru demosu" /><br />
    <b>QR kod generatoru</b> — Mətn və ya link yaz — QR brauzerdə qurulur, SVG və PNG kimi enir.<br />
    <a href="https://camalali.com/alet/qr">alətə bax →</a>
  </td>
</tr>
<tr>
  <td width="50%">
    <img src="assets/demo-json-csv.gif" width="100%" alt="JSON və CSV çeviricisi demosu" /><br />
    <b>JSON və CSV çeviricisi</b> — JSON massivini CSV-yə sal, ya da CSV-ni geri JSON-a çevir.<br />
    <a href="https://camalali.com/alet/json-csv">alətə bax →</a>
  </td>
  <td width="50%">
    <img src="assets/demo-dns.gif" width="100%" alt="DNS qeydləri yoxlayıcısı demosu" /><br />
    <b>DNS qeydləri yoxlayıcısı</b> — Domenin bütün qeydləri bir ekranda, SPF, DMARC və DKIM izahı ilə.<br />
    <a href="https://camalali.com/alet/dns">alətə bax →</a>
  </td>
</tr>
</table>

## Kateqoriyalar

<table>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/seo.svg" width="28" height="28" alt="" /><br />
    <b>SEO və axtarış</b><br />
    <sub>Meta teq, sitemap, robots.txt, kanonik ünvan, açar söz və link analizi — səhifənin axtarışda necə göründüyünü qurmaq və yoxlamaq üçün.</sub><br />
    19 alət · <a href="kateqoriya/seo.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/kod.svg" width="28" height="28" alt="" /><br />
    <b>Kod və inkişaf</b><br />
    <sub>JWT açmaq, UUID yaratmaq, regex sınamaq, cron ifadəsini oxumaq, mətn fərqini görmək və SQL-i formatlamaq — gündəlik kod işi.</sub><br />
    13 alət · <a href="kateqoriya/kod.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/shebeke.svg" width="28" height="28" alt="" /><br />
    <b>Şəbəkə və domen</b><br />
    <sub>Domenin DNS qeydləri, tapılan subdomenləri və IP alt şəbəkəsinin hesabı bir yerdə.</sub><br />
    29 alət · <a href="kateqoriya/shebeke.md">bax</a>
  </td>
</tr>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/tehlukesizlik.svg" width="28" height="28" alt="" /><br />
    <b>Təhlükəsizlik</b><br />
    <sub>Güclü parol, hash, saytın müdafiə başlıqları və parolun məlum sızmalarda olub-olmadığının yoxlanışı.</sub><br />
    13 alət · <a href="kateqoriya/tehlukesizlik.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/cedvel.svg" width="28" height="28" alt="" /><br />
    <b>Arayış cədvəlləri</b><br />
    <sub>Axtarılan cavabı bir cədvəldə verir: status kodu, HTTP başlığı, MIME tipi, port, əmr, icazə və simvol.</sub><br />
    15 alət · <a href="kateqoriya/cedvel.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/format.svg" width="28" height="28" alt="" /><br />
    <b>Format və çevirici</b><br />
    <sub>Bir formatı o birinə çevirən alətlər: JSON, YAML, Base64, URL kodlaşdırması və ad formatı.</sub><br />
    15 alət · <a href="kateqoriya/format.md">bax</a>
  </td>
</tr>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/sistem.svg" width="28" height="28" alt="" /><br />
    <b>Sistem dizaynı</b><br />
    <sub>Sistem dizaynının hesabı: gündəlik sorğu sayından RPS, saxlama və server sayı, üstəlik baza ilə arxitektura seçimi.</sub><br />
    10 alət · <a href="kateqoriya/sistem.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/metn.svg" width="28" height="28" alt="" /><br />
    <b>Mətn və məzmun</b><br />
    <sub>Mətnin söz və simvol statistikası, azərbaycanca nümunə mətn və başlıqdan slug çıxarmaq.</sub><br />
    8 alət · <a href="kateqoriya/metn.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/biznes.svg" width="28" height="28" alt="" /><br />
    <b>Biznes və sənəd</b><br />
    <sub>Sənəd və pul tərəfi: hesab-faktura, layihənin müddət qiymətləndirməsi və valyuta məzənnəsi.</sub><br />
    8 alət · <a href="kateqoriya/biznes.md">bax</a>
  </td>
</tr>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/fayl.svg" width="28" height="28" alt="" /><br />
    <b>Şəkil və fayl</b><br />
    <sub>Şəkli brauzerdə sıxır, formatını dəyişir və bir ünvandan QR kod düzəldir.</sub><br />
    10 alət · <a href="kateqoriya/fayl.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/dizayn.svg" width="28" height="28" alt="" /><br />
    <b>Dizayn və CSS</b><br />
    <sub>Rəng formatları arasında çevirmə və mətnlə fonun kontrastının ölçülməsi.</sub><br />
    18 alət · <a href="kateqoriya/dizayn.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/ekosistem.svg" width="28" height="28" alt="" /><br />
    <b>Paket və ekosistem</b><br />
    <sub>npm paketinin və GitHub profilinin canlı məlumatı — versiya, ölçü, asılılıq və fəaliyyət.</sub><br />
    7 alət · <a href="kateqoriya/ekosistem.md">bax</a>
  </td>
</tr>
</table>

## Quruluş

| Qovluq | Nə var |
|---|---|
| `lib/` | Alətin hesablama məntiqi — React yoxdur, xalis funksiyalardır |
| `components/` | React widget-ləri (`"use client"`) — Tailwind 4 və `globals.css` tələb edir |
| `api/` | 34 şəbəkə alətinin Next.js App Router marşrutu |
| `shared/` | Bir neçə alətin ortaq işlətdiyi köməkçi modullar |
| `tests/` | Hər alətin yoxlama halları — `pnpm test` |
| `kateqoriya/` | 12 kateqoriyanın alət siyahısı |
| `assets/` | README-də işlənən kateqoriya ikonları (SVG) və nümunə GIF-lər |
| `globals.css` | Widget-lərin işlətdiyi dizayn tokenləri (`.ios-*` sinifləri və s.) |
| `fonts/` | `pdf-nisan` və `faktura` alətlərinin PDF-ə yazdığı şrift — öz layihənin `public/fonts/`-una köçür |

## Üç səviyyə

Nə qədər ehtiyac varsa, o qədərini götür. Ətraflı: [ISTIFADE.md](ISTIFADE.md).

1. **Yalnız məntiq** — `lib/<alət>.ts` faylını öz layihənə köçür. Asılılığı yoxdur (`pdf-lib` və ya `shiki` istisna olmaqla — 159/165 alətdə heç biri yoxdur), hər yerdə işləyir.
2. **Məntiq + widget** — yuxarıdakı fayl + `components/<alət>-tool.tsx`. Tailwind 4 və `globals.css`-i köçür.
3. **Şəbəkə aləti** — yuxarıdakılar + `api/<alət>/route.ts`. Next.js App Router marşrutuna qoy, çünki server tərəfində xarici sorğu göndərir.

## Qeyd

Bu repo **generasiya olunur**: `scripts/export-tools.mts` camalali.com-un öz mənbəyindən qurur, burada əl ilə düzəliş saxlanmır. Düzəliş və ya yeni alət istəyini əsas layihəyə göndər — necə olduğunu [QATQI.md](QATQI.md) faylında oxu.

## Lisenziya

MIT — [LICENSE](LICENSE) faylına bax.
