# Biznes və sənəd

Hesab-faktura hazırlayır, layihənin müddətini qiymətləndirir və valyuta məzənnəsini göstərir.

8 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Layihə qiymətləndiricisi](https://camalali.com/alet/qiymetlendirici) | Dörd sual: mərhələ planı və iş günü ilə müddət aralığı. | `lib/estimate.ts`, `components/estimator.tsx` |  |
| [Hesab-faktura generatoru](https://camalali.com/alet/faktura) | Sətirləri yaz, ƏDV-ni seç, PDF-i endir. | `components/faktura-tool.tsx` |  |
| [Valyuta çevirici](https://camalali.com/alet/valyuta) | AZN və dünya valyutaları üçün tarixli məzənnə hesabı | `lib/valyuta.ts`, `components/valyuta-tool.tsx`, `api/valyuta/route.ts`, `tests/valyuta.mts` | Azərbaycan Mərkəzi Bankı (cbar.az) və Frankfurter (frankfurter.dev) |
| [PDF birləşdirici](https://camalali.com/alet/pdf-birlesdir) | PDF-lərin sırasını və hər fayldan götürüləcək səhifə aralığını seç; nəticədə hamısı tək sənəddə birləşir. | `lib/pdf-birlesdir.ts`, `components/pdf-birlesdir-tool.tsx`, `tests/pdf-birlesdir.mts` |  |
| [PDF bölücü](https://camalali.com/alet/pdf-bol) | PDF-i hər səhifə üzrə, yazdığın aralıqlara görə və ya hər N səhifədən bir bölüb ayrıca fayllar əldə edirsən. | `lib/pdf-bol.ts`, `components/pdf-bol-tool.tsx`, `tests/pdf-bol.mts` |  |
| [PDF səhifə redaktoru](https://camalali.com/alet/pdf-sehife) | PDF səhifələrini sırala, fırlat, sil və ya təkrarla. | `lib/pdf-sehife.ts`, `components/pdf-sehife-tool.tsx`, `tests/pdf-sehife.mts` |  |
| [Şəkildən PDF yaradıcısı](https://camalali.com/alet/sekil-pdf) | PNG və JPEG şəkillərini sıralayıb brauzerdə tək PDF-də topla. | `lib/sekil-pdf.ts`, `components/sekil-pdf-tool.tsx`, `tests/sekil-pdf.mts` |  |
| [PDF su nişanı və səhifə nömrəsi](https://camalali.com/alet/pdf-nisan) | Seçilmiş PDF səhifələrinə su nişanı və nömrə əlavə et. | `lib/pdf-nisan.ts`, `components/pdf-nisan-tool.tsx`, `tests/pdf-nisan.mts` |  |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
