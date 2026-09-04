# SEO və axtarış

Meta teqləri, sitemap, robots.txt və kanonik ünvanı qurur. Açar sözləri, linkləri və səhifənin axtarışda görünüşünü yoxlayır.

20 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Meta teq generatoru və önizləmə](https://camalali.com/alet/meta) | SEO və sosial şəbəkə meta teqlərini Google və sosial platforma kartları ilə birlikdə hazırlayır. | `lib/meta.ts`, `components/meta-tool.tsx`, `tests/meta.mts` | — |
| [robots.txt qurucusu və yoxlayıcısı](https://camalali.com/alet/robots) | Hazır şablondan robots.txt qur, sonra URL-i seçilən botun qaydaları ilə yoxla. | `lib/robots.ts`, `components/robots-tool.tsx`, `tests/robots.mts` | — |
| [Yönləndirmə qaydası generatoru](https://camalali.com/alet/yonlendirme) | Köhnə və yeni URL cütləri dörd server formatında hazır yönləndirmə qaydalarına çevrilir. | `lib/yonlendirme.ts`, `components/yonlendirme-tool.tsx`, `tests/yonlendirme.mts` | — |
| [SERP önizləməsi](https://camalali.com/alet/serp-onizleme) | Başlığın harada kəsildiyini mobil və masaüstü Google nəticəsində görürsən. | `lib/serp-onizleme.ts`, `components/serp-onizleme-tool.tsx`, `tests/serp-onizleme.mts` | — |
| [Schema.org JSON-LD qurucusu](https://camalali.com/alet/schema) | Altı Schema.org tipi üçün JSON-LD və script bloku; mövcud qeyddə çatışmayan sahələr və JSON xətasının yeri. | `lib/schema.ts`, `components/schema-tool.tsx`, `tests/schema.mts` | — |
| [Açar söz sıxlığı](https://camalali.com/alet/acar-soz-sixligi) | Mətndəki bir, iki və üç sözdən ibarət ifadələrin təkrar sayı və ümumi sözlərdəki faizi. | `lib/acar-soz-sixligi.ts`, `components/acar-soz-sixligi-tool.tsx`, `tests/acar-soz-sixligi.mts` | — |
| [Açar söz qruplaşdırması](https://camalali.com/alet/acar-soz-qruplasdirma) | Açar sözlər ortaq köklərinə görə mövzu qruplarında. | `lib/acar-soz-qruplasdirma.ts`, `components/acar-soz-qruplasdirma-tool.tsx`, `tests/acar-soz-qruplasdirma.mts` | — |
| [Başlıq strukturu yoxlayıcısı](https://camalali.com/alet/basliq-strukturu) | HTML başlıqlarının ağacı və iyerarxiya qüsurları bir baxışda. | `lib/basliq-strukturu.ts`, `components/basliq-strukturu-tool.tsx`, `tests/basliq-strukturu.mts` | — |
| [Link analizi](https://camalali.com/alet/link-analizi) | Daxili və xarici linklər, anchor mətnləri və riskli link xüsusiyyətləri bir cədvəldə. | `lib/link-analizi.ts`, `components/link-analizi-tool.tsx`, `tests/link-analizi.mts` | — |
| [Kanonik URL normallaşdırıcısı](https://camalali.com/alet/kanonik) | Eyni səhifəyə düşən URL variantlarını seçilən qaydalarla kanonik formaya salırsan. | `lib/kanonik.ts`, `components/kanonik-tool.tsx`, `tests/kanonik.mts` | — |
| [hreflang qurucusu](https://camalali.com/alet/hreflang) | Dil və URL cütlərindən üç formatda hreflang dəsti; mövcud dəstdə isə kod, istinad və ünvan səhvlərinin yoxlanması. | `lib/hreflang.ts`, `components/hreflang-tool.tsx`, `tests/hreflang.mts` | — |
| [UTM link qurucusu](https://camalali.com/alet/utm) | UTM kampaniya linkini qur və ya hazır linki parametrləri ilə təmiz URL-inə ayır. | `lib/utm.ts`, `components/utm-tool.tsx`, `tests/utm.mts` | — |
| [Toplu meta yoxlaması](https://camalali.com/alet/toplu-meta) | CSV və ya TSV cədvəlində başlıq və təsvir qüsurlarını toplu görür, nəticəni CSV kimi endirirsən. | `lib/toplu-meta.ts`, `components/toplu-meta-tool.tsx`, `tests/toplu-meta.mts` | — |
| [sitemap.xml qurucusu](https://camalali.com/alet/sitemap-qurucu) | URL siyahısı sitemap.xml-ə çevrilir; 50 000 URL və ya 50 MB həddi keçiləndə hissələrə və index faylına bölünür. | `lib/sitemap-qurucu.ts`, `components/sitemap-qurucu-tool.tsx`, `tests/sitemap-qurucu.mts` | — |
| [llms.txt qurucusu](https://camalali.com/alet/llms-txt) | Sayt məlumatları llms.txt faylına çevrilir; quruluş səhvləri sətir nömrəsi ilə verilir. | `lib/llms-txt.ts`, `components/llms-txt-tool.tsx`, `tests/llms-txt.mts` | — |
| [Open Graph önizləməsi](https://camalali.com/alet/og-onizleme) | Linkin dörd sosial platformadakı kart önizləməsi. | `lib/og-onizleme.ts`, `components/og-onizleme-tool.tsx`, `api/og-onizleme/route.ts`, `tests/og-onizleme.mts` | Yazdığın ünvanın öz saytı |
| [Sitemap və lent yoxlayıcısı](https://camalali.com/alet/sitemap-yoxlayici) | Canlı sitemap, RSS və ya Atom faylında ünvanlar, tarix aralığı, təkrarlar və XML qüsurları. | `lib/sitemap-yoxlayici.ts`, `components/sitemap-yoxlayici-tool.tsx`, `api/sitemap-yoxlayici/route.ts`, `tests/sitemap-yoxlayici.mts` | Yazdığın ünvanın öz saytı |
| [Yönləndirmə zənciri](https://camalali.com/alet/yonlendirme-zenciri) | Yönləndirmə zəncirinin hər addımı, status kodu və son dayanacağı. | `lib/yonlendirme-zenciri.ts`, `components/yonlendirme-zenciri-tool.tsx`, `api/yonlendirme-zenciri/route.ts`, `tests/yonlendirme-zenciri.mts` | Yazdığın ünvanın öz saytı |
| [Canlı robots.txt yoxlayıcısı](https://camalali.com/alet/robots-canli) | Canlı robots.txt-də yolu bloklayan qayda və həmin sətrin nömrəsi. | `lib/robots-canli.ts`, `components/robots-canli-tool.tsx`, `api/robots-canli/route.ts`, `tests/robots-canli.mts` | Yazdığın domenin öz saytı |
| [Birləşik sayt hesabatı](https://camalali.com/alet/sayt-hesabati) | Bir ünvan yaz, təhlükəsizlik, sürət, meta və indeks bir hesabatda toplansın. | `components/sayt-hesabati-tool.tsx`, `api/sayt-hesabati/route.ts`, `tests/sayt-hesabati.mts` | Yazdığın ünvanın öz saytı |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
