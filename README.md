# camalali-tools

165 kiçik alət var: JWT açmaq, DNS yoxlamaq, hash hesablamaq, hesab-faktura yaratmaq və başqa işlər üçün. Hamısı camalali.com üçün yazılıb və öz mənbəyindən buraya generasiya olunub. Kod eynidir, saytın pəncərə sistemi daxil edilməyib.

![alət](https://img.shields.io/badge/al%C9%99t-165-3584e4) ![kateqoriya](https://img.shields.io/badge/kateqoriya-12-3584e4) ![test halı](https://img.shields.io/badge/test_hal%C4%B1-2318%2B-12a5a5) ![asılılıqsız](https://img.shields.io/badge/as%C4%B1l%C4%B1l%C4%B1qs%C4%B1z-159_al%C9%99t-6c5ce7) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6) ![lisenziya](https://img.shields.io/badge/lisenziya-MIT-2ec27e)

![](assets/hero.gif)

Canlı nümunə: hər alətin işlək halına burada bax → https://camalali.com/alet

## Sürətli başlanğıc

`lib/cron.ts` faylını layihənə köçür, idxal et və çağır. Üçüncü tərəf asılılığı yoxdur:

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
    <b>Gradient qurucusu</b> — İstənilən sayda rəng dayanacağı ilə xətti, radial və konus gradientlər qurursan.<br />
    <a href="https://camalali.com/alet/qradient">alətə bax →</a>
  </td>
  <td width="50%">
    <img src="assets/demo-qr.gif" width="100%" alt="QR kod generatoru demosu" /><br />
    <b>QR kod generatoru</b> — Mətn və link üçün SVG və PNG QR kodları.<br />
    <a href="https://camalali.com/alet/qr">alətə bax →</a>
  </td>
</tr>
<tr>
  <td width="50%">
    <img src="assets/demo-json-csv.gif" width="100%" alt="JSON və CSV çeviricisi demosu" /><br />
    <b>JSON və CSV çeviricisi</b> — JSON massivindən CSV, CSV cədvəlindən JSON alırsan.<br />
    <a href="https://camalali.com/alet/json-csv">alətə bax →</a>
  </td>
  <td width="50%">
    <img src="assets/demo-dns.gif" width="100%" alt="DNS qeydləri yoxlayıcısı demosu" /><br />
    <b>DNS qeydləri yoxlayıcısı</b> — Əsas DNS qeydləri və poçt siyasətləri bir ekranda.<br />
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
    <sub>Meta teqləri, sitemap, robots.txt və kanonik ünvanı qurur. Açar sözləri, linkləri və səhifənin axtarışda görünüşünü yoxlayır.</sub><br />
    19 alət · <a href="kateqoriya/seo.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/kod.svg" width="28" height="28" alt="" /><br />
    <b>Kod və inkişaf</b><br />
    <sub>JWT açır, UUID yaradır, regex sınayır və cron ifadəsini oxuyur. Mətn fərqini göstərir və SQL-i formatlayır.</sub><br />
    13 alət · <a href="kateqoriya/kod.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/shebeke.svg" width="28" height="28" alt="" /><br />
    <b>Şəbəkə və domen</b><br />
    <sub>Domenin DNS qeydlərini və tapılan subdomenlərini göstərir. IP alt şəbəkəsini hesablayır.</sub><br />
    29 alət · <a href="kateqoriya/shebeke.md">bax</a>
  </td>
</tr>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/tehlukesizlik.svg" width="28" height="28" alt="" /><br />
    <b>Təhlükəsizlik</b><br />
    <sub>Parol və hash yaradır. Saytın müdafiə başlıqlarını və parolun məlum sızmalarda olub-olmadığını yoxlayır.</sub><br />
    13 alət · <a href="kateqoriya/tehlukesizlik.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/cedvel.svg" width="28" height="28" alt="" /><br />
    <b>Arayış cədvəlləri</b><br />
    <sub>Status kodları, HTTP başlıqları, MIME tipləri və portlar üçün arayış verir. Əmrlər, icazələr və simvollar da daxildir.</sub><br />
    15 alət · <a href="kateqoriya/cedvel.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/format.svg" width="28" height="28" alt="" /><br />
    <b>Format və çevirici</b><br />
    <sub>JSON, YAML, Base64, URL kodlaşdırması və ad formatları arasında çevirmə aparır.</sub><br />
    15 alət · <a href="kateqoriya/format.md">bax</a>
  </td>
</tr>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/sistem.svg" width="28" height="28" alt="" /><br />
    <b>Sistem dizaynı</b><br />
    <sub>Gündəlik sorğu sayına əsasən RPS, saxlama həcmi və server sayını hesablayır. Baza və arxitektura seçimini göstərir.</sub><br />
    10 alət · <a href="kateqoriya/sistem.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/metn.svg" width="28" height="28" alt="" /><br />
    <b>Mətn və məzmun</b><br />
    <sub>Mətnin söz və simvol statistikasını hesablayır. Azərbaycanca nümunə mətn yaradır və başlıqdan slug çıxarır.</sub><br />
    8 alət · <a href="kateqoriya/metn.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/biznes.svg" width="28" height="28" alt="" /><br />
    <b>Biznes və sənəd</b><br />
    <sub>Hesab-faktura hazırlayır, layihənin müddətini qiymətləndirir və valyuta məzənnəsini göstərir.</sub><br />
    8 alət · <a href="kateqoriya/biznes.md">bax</a>
  </td>
</tr>
<tr>
  <td width="33%" valign="top">
    <img src="assets/icons/fayl.svg" width="28" height="28" alt="" /><br />
    <b>Şəkil və fayl</b><br />
    <sub>Şəkli brauzerdə sıxır və formatını dəyişir. Verilən ünvandan QR kod yaradır.</sub><br />
    10 alət · <a href="kateqoriya/fayl.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/dizayn.svg" width="28" height="28" alt="" /><br />
    <b>Dizayn və CSS</b><br />
    <sub>Rəng formatları arasında çevirmə aparır və mətnlə fonun kontrastını ölçür.</sub><br />
    18 alət · <a href="kateqoriya/dizayn.md">bax</a>
  </td>
  <td width="33%" valign="top">
    <img src="assets/icons/ekosistem.svg" width="28" height="28" alt="" /><br />
    <b>Paket və ekosistem</b><br />
    <sub>npm paketinin versiyasını, ölçüsünü və asılılıqlarını göstərir. GitHub profilinin fəaliyyət məlumatını da alır.</sub><br />
    7 alət · <a href="kateqoriya/ekosistem.md">bax</a>
  </td>
</tr>
</table>

## Quruluş

| Qovluq | Nə var |
|---|---|
| `lib/` | Alətin hesablama məntiqi. React yoxdur, yalnız funksiyalar var |
| `components/` | React widget-ləri (`"use client"`). Tailwind 4 və `globals.css` tələb edir |
| `api/` | 34 şəbəkə alətinin Next.js App Router marşrutu |
| `shared/` | Bir neçə alətin ortaq işlətdiyi köməkçi modullar |
| `tests/` | Hər alətin yoxlama halları. İşə salmaq üçün: `pnpm test` |
| `kateqoriya/` | 12 kateqoriyanın alət siyahısı |
| `assets/` | README-də işlənən kateqoriya ikonları (SVG) və nümunə GIF-lər |
| `globals.css` | Widget-lərin işlətdiyi dizayn tokenləri (`.ios-*` sinifləri və s.) |
| `fonts/` | `pdf-nisan` və `faktura` alətlərinin PDF-ə yazdığı şrift. Layihənin `public/fonts/` qovluğuna köçür |

## Üç səviyyə

Alətləri üç səviyyədə köçürmək olar. Ətraflı: [ISTIFADE.md](ISTIFADE.md).

1. **Yalnız məntiq:** `lib/<alət>.ts` faylını layihənə köçür. `pdf-lib` və ya `shiki` işlədənlər istisnadır; 159/165 alətdə bunların heç biri yoxdur. Qalanlarının asılılığı yoxdur və hər yerdə işləyir.
2. **Məntiq + widget:** yuxarıdakı fayla `components/<alət>-tool.tsx` əlavə olunur. Tailwind 4 və `globals.css`-i də köçür.
3. **Şəbəkə aləti:** yuxarıdakılara `api/<alət>/route.ts` əlavə olunur. Xarici sorğunu server tərəfində göndərdiyi üçün faylı Next.js App Router marşrutuna qoy.

## Qeyd

Bu repo generasiya olunur. `scripts/export-tools.mts` onu camalali.com-un öz mənbəyindən qurur. Burada edilən əl ilə düzəlişlər saxlanmır. Düzəliş və ya yeni alət istəyini əsas layihəyə göndərmək qaydası [QATQI.md](QATQI.md) faylındadır.

## Lisenziya

MIT. [LICENSE](LICENSE) faylına bax.
