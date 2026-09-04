# camalali-tools

165 kiçik alət — JWT açmaqdan DNS yoxlamasına, hash hesablamaqdan hesab-faktura düzəltməyə qədər. Hər biri camalali.com üçün yazılıb və oradan buraya **generasiya olunub**: kod eynidir, sadəcə saytın pəncərə sistemindən ayrılıb.

**Canlı nümunə:** hər alətin işlək halını burada gör → **https://camalali.com/alet**

## Rəqəmlər

- **165** alət, **12** kateqoriyada
- **34** alət xarici xidmətə sorğu göndərir (DNS, WHOIS, npm registry və s.) — qalan 131 tamamilə brauzerdə işləyir
- **2318**-dən çox yoxlama halı — dəqiq sayı `pnpm test` özü yazır (bəziləri dövrə içində qat-qat artır)

## Quruluş

| Qovluq | Nə var |
|---|---|
| `lib/` | Alətin hesablama məntiqi — React yoxdur, xalis funksiyalardır |
| `components/` | React widget-ləri (`"use client"`) — Tailwind 4 və `globals.css` tələb edir |
| `api/` | 34 şəbəkə alətinin Next.js App Router marşrutu |
| `shared/` | Bir neçə alətin ortaq işlətdiyi köməkçi modullar |
| `tests/` | Hər alətin yoxlama halları — `pnpm test` |
| `kateqoriya/` | 12 kateqoriyanın alət siyahısı |
| `globals.css` | Widget-lərin işlətdiyi dizayn tokenləri (`.ios-*` sinifləri və s.) |
| `fonts/` | `pdf-nisan` və `faktura` alətlərinin PDF-ə yazdığı şrift — öz layihənin `public/fonts/`-una köçür |

## Necə götürüb işlətməli

Üç səviyyə var — nə qədər ehtiyacın varsa, o qədərini götür. Ətraflı: [ISTIFADE.md](ISTIFADE.md).

1. **Yalnız məntiq** — `lib/<alət>.ts` faylını öz layihənə köçür. Asılılığı yoxdur (bəzilərində `pdf-lib` və ya `shiki` istisna olmaqla), hər yerdə işləyir.
2. **Məntiq + widget** — yuxarıdakı fayl + `components/<alət>-tool.tsx`. Tailwind 4 və `globals.css`-in köçürülməsi lazımdır.
3. **Şəbəkə aləti** — yuxarıdakılar + `api/<alət>/route.ts`. Next.js App Router marşrutuna qoyulmalıdır, çünki server tərəfində xarici sorğu göndərir.

## Kateqoriyalar

| Kateqoriya | Nə üçündür | Alət sayı | Siyahı |
|---|---|---|---|
| SEO və axtarış | Meta teq, sitemap, robots.txt, kanonik ünvan, açar söz və link analizi — səhifənin axtarışda necə göründüyünü qurmaq və yoxlamaq üçün. | 19 | [kateqoriya/seo.md](kateqoriya/seo.md) |
| Kod və inkişaf | JWT açmaq, UUID yaratmaq, regex sınamaq, cron ifadəsini oxumaq, mətn fərqini görmək və SQL-i formatlamaq — gündəlik kod işi. | 13 | [kateqoriya/kod.md](kateqoriya/kod.md) |
| Şəbəkə və domen | Domenin DNS qeydləri, tapılan subdomenləri və IP alt şəbəkəsinin hesabı bir yerdə. | 29 | [kateqoriya/shebeke.md](kateqoriya/shebeke.md) |
| Təhlükəsizlik | Güclü parol, hash, saytın müdafiə başlıqları və parolun məlum sızmalarda olub-olmadığının yoxlanışı. | 13 | [kateqoriya/tehlukesizlik.md](kateqoriya/tehlukesizlik.md) |
| Arayış cədvəlləri | Axtarılan cavabı bir cədvəldə verir: status kodu, HTTP başlığı, MIME tipi, port, əmr, icazə və simvol. | 15 | [kateqoriya/cedvel.md](kateqoriya/cedvel.md) |
| Format və çevirici | Bir formatı o birinə çevirən alətlər: JSON, YAML, Base64, URL kodlaşdırması və ad formatı. | 15 | [kateqoriya/format.md](kateqoriya/format.md) |
| Sistem dizaynı | Sistem dizaynının hesabı: gündəlik sorğu sayından RPS, saxlama və server sayı, üstəlik baza ilə arxitektura seçimi. | 10 | [kateqoriya/sistem.md](kateqoriya/sistem.md) |
| Mətn və məzmun | Mətnin söz və simvol statistikası, azərbaycanca nümunə mətn və başlıqdan slug çıxarmaq. | 8 | [kateqoriya/metn.md](kateqoriya/metn.md) |
| Biznes və sənəd | Sənəd və pul tərəfi: hesab-faktura, layihənin müddət qiymətləndirməsi və valyuta məzənnəsi. | 8 | [kateqoriya/biznes.md](kateqoriya/biznes.md) |
| Şəkil və fayl | Şəkli brauzerdə sıxır, formatını dəyişir və bir ünvandan QR kod düzəldir. | 10 | [kateqoriya/fayl.md](kateqoriya/fayl.md) |
| Dizayn və CSS | Rəng formatları arasında çevirmə və mətnlə fonun kontrastının ölçülməsi. | 18 | [kateqoriya/dizayn.md](kateqoriya/dizayn.md) |
| Paket və ekosistem | npm paketinin və GitHub profilinin canlı məlumatı — versiya, ölçü, asılılıq və fəaliyyət. | 7 | [kateqoriya/ekosistem.md](kateqoriya/ekosistem.md) |

## Lisenziya

MIT — [LICENSE](LICENSE) faylına bax.

Bu repo **generasiya olunur**: `scripts/export-tools.mts` camalali.com-un öz mənbəyindən qurur, burada əl ilə düzəliş saxlanmır. Düzəliş və ya yeni alət istəyirsənsə, PR-ı əsas layihəyə (camalali.com-un mənbəyinə) göndər.
