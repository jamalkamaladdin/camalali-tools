# SEO və axtarış

Meta teq, sitemap, robots.txt, kanonik ünvan, açar söz və link analizi — səhifənin axtarışda necə göründüyünü qurmaq və yoxlamaq üçün.

19 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Meta teq generatoru və önizləmə](https://camalali.com/alet/meta) | Mətni yaz — nəticəni Google axtarışında, sosial kartda və Twitter-də necə görünəcəyi ilə birlikdə gör. | `lib/meta.ts`, `components/meta-tool.tsx`, `tests/meta.mts` | — |
| [robots.txt qurucusu və yoxlayıcısı](https://camalali.com/alet/robots) | Şablondan robots.txt qur, ya da mövcudunu yapışdır və bir URL-i bir bot üçün yoxla. | `lib/robots.ts`, `components/robots-tool.tsx`, `tests/robots.mts` | — |
| [Yönləndirmə qaydası generatoru](https://camalali.com/alet/yonlendirme) | Köhnə → yeni URL cütlərindən nginx, Apache, Caddy, Next.js qaydası qurur. | `lib/yonlendirme.ts`, `components/yonlendirme-tool.tsx`, `tests/yonlendirme.mts` | — |
| [SERP önizləməsi](https://camalali.com/alet/serp-onizleme) | Başlığın Google-da kəsilib-kəsilmədiyini simvol saymadan gör. | `lib/serp-onizleme.ts`, `components/serp-onizleme-tool.tsx`, `tests/serp-onizleme.mts` | — |
| [Schema.org JSON-LD qurucusu](https://camalali.com/alet/schema) | Sahələri doldur, hazır JSON-LD al — ya da mövcud qeydi yoxla. | `lib/schema.ts`, `components/schema-tool.tsx`, `tests/schema.mts` | — |
| [Açar söz sıxlığı](https://camalali.com/alet/acar-soz-sixligi) | Mətndə hansı sözlərin təkrarlandığını və neçə faiz tutduğunu gör. | `lib/acar-soz-sixligi.ts`, `components/acar-soz-sixligi-tool.tsx`, `tests/acar-soz-sixligi.mts` | — |
| [Açar söz qruplaşdırması](https://camalali.com/alet/acar-soz-qruplasdirma) | Uzun açar söz siyahısını ortaq sözə görə mövzu qruplarına böl. | `lib/acar-soz-qruplasdirma.ts`, `components/acar-soz-qruplasdirma-tool.tsx`, `tests/acar-soz-qruplasdirma.mts` | — |
| [Başlıq strukturu yoxlayıcısı](https://camalali.com/alet/basliq-strukturu) | HTML yapışdır — başlıq ağacını və iyerarxiya səhvlərini gör. | `lib/basliq-strukturu.ts`, `components/basliq-strukturu-tool.tsx`, `tests/basliq-strukturu.mts` | — |
| [Link analizi](https://camalali.com/alet/link-analizi) | HTML yapışdır — bütün linkləri, anchor mətnlərini və qüsurları bir cədvəldə gör. | `lib/link-analizi.ts`, `components/link-analizi-tool.tsx`, `tests/link-analizi.mts` | — |
| [Kanonik URL normallaşdırıcısı](https://camalali.com/alet/kanonik) | URL-ləri yapışdır — kanonik formanı və eyni səhifəyə düşənləri gör. | `lib/kanonik.ts`, `components/kanonik-tool.tsx`, `tests/kanonik.mts` | — |
| [hreflang qurucusu](https://camalali.com/alet/hreflang) | Dil və ünvan cütlərini yaz — hazır hreflang teqlərini al, ya da mövcud dəsti yoxla. | `lib/hreflang.ts`, `components/hreflang-tool.tsx`, `tests/hreflang.mts` | — |
| [UTM link qurucusu](https://camalali.com/alet/utm) | Kampaniya linki qur — ya da hazır linki parçalayıb parametrləri gör. | `lib/utm.ts`, `components/utm-tool.tsx`, `tests/utm.mts` | — |
| [Toplu meta yoxlaması](https://camalali.com/alet/toplu-meta) | Yüzlərlə səhifənin başlıq və təsvirini bir cədvəldə yoxla. | `lib/toplu-meta.ts`, `components/toplu-meta-tool.tsx`, `tests/toplu-meta.mts` | — |
| [sitemap.xml qurucusu](https://camalali.com/alet/sitemap-qurucu) | URL siyahısından sitemap.xml qur — lazım olsa bölünmüş şəkildə. | `lib/sitemap-qurucu.ts`, `components/sitemap-qurucu-tool.tsx`, `tests/sitemap-qurucu.mts` | — |
| [llms.txt qurucusu](https://camalali.com/alet/llms-txt) | llms.txt qur — ya da hazır faylın quruluşunu yoxla. | `lib/llms-txt.ts`, `components/llms-txt-tool.tsx`, `tests/llms-txt.mts` | — |
| [Open Graph önizləməsi](https://camalali.com/alet/og-onizleme) | Linki paylaşmazdan əvvəl dörd platformada necə görünəcəyini gör. | `lib/og-onizleme.ts`, `components/og-onizleme-tool.tsx`, `api/og-onizleme/route.ts`, `tests/og-onizleme.mts` | Yazdığın ünvanın öz saytı |
| [Sitemap və lent yoxlayıcısı](https://camalali.com/alet/sitemap-yoxlayici) | Sitemap ünvanını yaz — neçə URL, hansı tarix aralığı, hansı qüsur. | `lib/sitemap-yoxlayici.ts`, `components/sitemap-yoxlayici-tool.tsx`, `api/sitemap-yoxlayici/route.ts`, `tests/sitemap-yoxlayici.mts` | Yazdığın ünvanın öz saytı |
| [Yönləndirmə zənciri](https://camalali.com/alet/yonlendirme-zenciri) | Ünvan neçə addımdan keçir, hansı statuslarla və harada bitir. | `lib/yonlendirme-zenciri.ts`, `components/yonlendirme-zenciri-tool.tsx`, `api/yonlendirme-zenciri/route.ts`, `tests/yonlendirme-zenciri.mts` | Yazdığın ünvanın öz saytı |
| [Canlı robots.txt yoxlayıcısı](https://camalali.com/alet/robots-canli) | Yolun hansı robots.txt sətri ilə bloklandığını gör. | `lib/robots-canli.ts`, `components/robots-canli-tool.tsx`, `api/robots-canli/route.ts`, `tests/robots-canli.mts` | Yazdığın domenin öz saytı |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
