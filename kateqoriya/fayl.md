# Şəkil və fayl

Şəkli brauzerdə sıxır, formatını dəyişir və bir ünvandan QR kod düzəldir.

10 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [QR kod generatoru](https://camalali.com/alet/qr) | Mətn və ya link yaz — QR brauzerdə qurulur, SVG və PNG kimi enir. | `lib/qr.ts`, `components/qr-tool.tsx`, `tests/qr.mts` | — |
| [Şəkil sıxıcısı və çeviricisi](https://camalali.com/alet/sekil) | Şəkli sıx, ölçüsünü dəyiş, formatını çevir — heç yerə göndərmədən. | `lib/sekil.ts`, `components/sekil-tool.tsx`, `tests/sekil.mts` | — |
| [Favicon dəsti generatoru](https://camalali.com/alet/favicon) | Şəkil yüklə — tam favicon dəsti, manifest və <head> kodu hazır olsun. | `lib/favicon.ts`, `components/favicon-tool.tsx`, `tests/favicon.mts` | — |
| [Paylaşım şəkli (Open Graph) generatoru](https://camalali.com/alet/og-sekil) | Başlıq yaz — paylaşım şəkli canvas-da qurulur, PNG kimi enir. | `lib/og-sekil.ts`, `components/og-sekil-tool.tsx`, `tests/og-sekil.mts` | — |
| [SVG optimallaşdırıcı](https://camalali.com/alet/svg-optimallasdirici) | SVG yapışdır — hər qaydanın qazancını gör, kiçilmiş SVG-ni kopyala. | `lib/svg-optimallasdirici.ts`, `components/svg-optimallasdirici-tool.tsx`, `tests/svg-optimallasdirici.mts` | — |
| [SVG-dən PNG çevirici](https://camalali.com/alet/svg-png) | SVG yapışdır — istədiyin ölçüdə PNG kimi endir. | `lib/svg-png.ts`, `components/svg-png-tool.tsx`, `tests/svg-png.mts` | — |
| [EXIF oxucusu və təmizləyicisi](https://camalali.com/alet/exif) | Şəklin gizli metadatasını gör — kamera, tarix, GPS — və istəsən bir kliklə sil. | `lib/exif.ts`, `components/exif-tool.tsx`, `tests/exif.mts` | — |
| [Şəkildən rəng palitrası çıxarıcısı](https://camalali.com/alet/sekil-reng) | Hər swatch üçün HEX, RGB, HSL və pay faizini göstərir, nəticəni CSS dəyişəni kimi kopyalamağa hazır edir. | `lib/sekil-reng.ts`, `components/sekil-reng-tool.tsx`, `tests/sekil-reng.mts` | — |
| [QR kod oxuyucu](https://camalali.com/alet/qr-oxuyucu) | Şəkli seç — QR-in içindəki mətn brauzerdə açılır, fayl yüklənmir. | `lib/qr-oxuyucu.ts`, `components/qr-oxuyucu-tool.tsx`, `tests/qr-oxuyucu.mts` | — |
| [Kod şəkli generatoru](https://camalali.com/alet/kod-sekil) | Sətirləri vurğula, pəncərə çərçivəsi əlavə et — nəticə paylaşıla bilən şəkildir. | `lib/kod-sekil.ts`, `components/kod-sekil-tool.tsx`, `tests/kod-sekil.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
