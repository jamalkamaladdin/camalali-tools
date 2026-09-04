# Biznes və sənəd

Sənəd və pul tərəfi: hesab-faktura, layihənin müddət qiymətləndirməsi və valyuta məzənnəsi.

8 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Layihə qiymətləndiricisi](https://camalali.com/alet/qiymetlendirici) | Dörd sual — mərhələ planı və iş günü ilə müddət aralığı. | `lib/estimate.ts`, `components/estimator.tsx` | — |
| [Hesab-faktura generatoru](https://camalali.com/alet/faktura) | Sətirləri yaz, ƏDV-ni seç, PDF-i endir. | `components/faktura-tool.tsx` | — |
| [Valyuta çevirici](https://camalali.com/alet/valyuta) | AZN ⇄ xarici valyuta rəsmi CBAR məzənnəsi ilə, dünya valyutaları isə öz aralarında. | `lib/valyuta.ts`, `components/valyuta-tool.tsx`, `api/valyuta/route.ts`, `tests/valyuta.mts` | Azərbaycan Mərkəzi Bankı (cbar.az) və Frankfurter (frankfurter.dev) |
| [PDF birləşdirici](https://camalali.com/alet/pdf-birlesdir) | Neçə PDF-i sırala, birləşdir, endir — hamısı bir kliklə. | `lib/pdf-birlesdir.ts`, `components/pdf-birlesdir-tool.tsx`, `tests/pdf-birlesdir.mts` | — |
| [PDF bölücü](https://camalali.com/alet/pdf-bol) | PDF-i səhifə-səhifə, aralıqla və ya hər N səhifədən bir böl. | `lib/pdf-bol.ts`, `components/pdf-bol-tool.tsx`, `tests/pdf-bol.mts` | — |
| [PDF səhifə redaktoru](https://camalali.com/alet/pdf-sehife) | Səhifələri sil, fırlat, sırala, təkrarla — addım-addım, geri qaytarıla bilən. | `lib/pdf-sehife.ts`, `components/pdf-sehife-tool.tsx`, `tests/pdf-sehife.mts` | — |
| [Şəkildən PDF yaradıcısı](https://camalali.com/alet/sekil-pdf) | Şəkilləri sürüşdür, sırala, PDF kimi endir — heç yerə yüklənmir. | `lib/sekil-pdf.ts`, `components/sekil-pdf-tool.tsx`, `tests/sekil-pdf.mts` | — |
| [PDF su nişanı və səhifə nömrəsi](https://camalali.com/alet/pdf-nisan) | PDF-i seç, su nişanını və səhifə nömrəsini quraşdır, endir. | `lib/pdf-nisan.ts`, `components/pdf-nisan-tool.tsx`, `tests/pdf-nisan.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
