# Dizayn və CSS

Rəng formatları arasında çevirmə aparır və mətnlə fonun kontrastını ölçür.

18 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Rəng çeviricisi və kontrast yoxlayıcısı](https://camalali.com/alet/reng) | HEX, RGB, HSL və OKLCH çevirməsi, WCAG kontrast hesabı və rəng korluğu simulyasiyası bir ekranda. | `lib/reng.ts`, `components/reng-tool.tsx`, `tests/reng.mts` | — |
| [Box-shadow qurucusu](https://camalali.com/alet/kolge) | Canlı tənzimlənən kölgə və yenidən parametrlərə ayrılan mövcud `box-shadow` sətri. | `lib/kolge.ts`, `components/kolge-tool.tsx`, `tests/kolge.mts` | — |
| [Çoxqatlı realist kölgə qurucusu](https://camalali.com/alet/kolge-qati) | Yüksəklik səviyyəsi 1-dən 6-ya qalxdıqca 2–4 kölgə qatı və ən yaxın Tailwind `shadow-*` qarşılığı hesablanır. | `lib/kolge-qati.ts`, `components/kolge-qati-tool.tsx`, `tests/kolge-qati.mts` | — |
| [Gradient qurucusu](https://camalali.com/alet/qradient) | İstənilən sayda rəng dayanacağı ilə xətti, radial və konus gradientlər qurursan. | `lib/qradient.ts`, `components/qradient-tool.tsx`, `tests/qradient.mts` | — |
| [Border-radius qurucusu](https://camalali.com/alet/kunc) | Dairəvi və elliptik künclər yığcam `border-radius` sətrində. | `lib/kunc.ts`, `components/kunc-tool.tsx`, `tests/kunc.mts` | — |
| [Şüşə effekti (glassmorphism) qurucusu](https://camalali.com/alet/sise) | Buzlu şüşə paneli rəngli fonda canlı görünür; CSS-ə Safari prefiksi də əlavə olunur. | `lib/sise.ts`, `components/sise-tool.tsx`, `tests/sise.mts` | — |
| [Cubic-bezier asanlıq əyrisi qurucusu](https://camalali.com/alet/asanliq) | Dörd nəzarət nöqtəsi ilə qurulan `cubic-bezier()` əyrisi və vaxt oxunda canlı irəliləmə. | `lib/asanliq.ts`, `components/asanliq-tool.tsx`, `tests/asanliq.mts` | — |
| [@keyframes animasiya qurucusu](https://camalali.com/alet/animasiya) | 0%–100% addımları tam `@keyframes` blokuna çevrilir. | `lib/animasiya.ts`, `components/animasiya-tool.tsx`, `tests/animasiya.mts` | — |
| [CSS üçbucaq qurucusu](https://camalali.com/alet/ucbucaq) | Səkkiz istiqamət üçün border üçbucağı və yanında `clip-path` alternativi. | `lib/ucbucaq.ts`, `components/ucbucaq-tool.tsx`, `tests/ucbucaq.mts` | — |
| [CSS yüklənmə göstəricisi qurucusu](https://camalali.com/alet/yuklenme) | JavaScript-siz işləyən beş yüklənmə göstəricisi; HTML və CSS ayrı kopyalanır. | `lib/yuklenme.ts`, `components/yuklenme-tool.tsx`, `tests/yuklenme.mts` | — |
| [CSS naxış qurucusu](https://camalali.com/alet/naxis) | Beş naxış növündən birini seç; fon şəkil faylı olmadan qradiyent CSS kimi qurulur. | `lib/naxis.ts`, `components/naxis-tool.tsx`, `tests/naxis.mts` | — |
| [Rəng şkalası generatoru](https://camalali.com/alet/palitra) | Bir rəngdən 11 pilləlik OKLCH şkalası; Tailwind, CSS dəyişənləri və ya HEX çıxışı, üstəlik ağ-qara fonda WCAG kontrastı. | `lib/palitra.ts`, `components/palitra-tool.tsx`, `tests/palitra.mts` | — |
| [Modul tipoqrafiya şkalası](https://camalali.com/alet/tipoqrafiya) | Baza ölçüsü və nisbətdən doqquz pilləlik `px` və `rem` şkalası, hər pilləyə uyğun sətiraralığı ilə. | `lib/tipoqrafiya.ts`, `components/tipoqrafiya-tool.tsx`, `tests/tipoqrafiya.mts` | — |
| [Flexbox və grid qurucusu](https://camalali.com/alet/flex-grid) | Flexbox və grid düzümünü canlı qurursan; eyni seçimlərdən düz CSS və uyğun Tailwind sinifləri yaranır. | `lib/flex-grid.ts`, `components/flex-grid-tool.tsx`, `tests/flex-grid.mts` | — |
| [clip-path qurucusu](https://camalali.com/alet/kesim) | Dörd forma və qəliblərdən dəqiq `clip-path` sətri. | `lib/kesim.ts`, `components/kesim-tool.tsx`, `tests/kesim.mts` | — |
| [CSS sıxışdırıcı](https://camalali.com/alet/css-sixisdirici) | CSS üçün səkkiz ayrı sıxışdırma qaydası; hər birinin qazandırdığı bayt ayrıca görünür. | `lib/css-sixisdirici.ts`, `components/css-sixisdirici-tool.tsx`, `tests/css-sixisdirici.mts` | — |
| [HTML sıxışdırıcı](https://camalali.com/alet/html-sixisdirici) | Seçilən qaydalar HTML-i sıxışdırır, `<pre>`, `<textarea>` və `<code>` daxilindəki mətn isə dəyişməz qalır. | `lib/html-sixisdirici.ts`, `components/html-sixisdirici-tool.tsx`, `tests/html-sixisdirici.mts` | — |
| [JavaScript sıxışdırıcı](https://camalali.com/alet/js-sixisdirici) | Dəyişən adlarına toxunmadan sıxışdırılmış və sintaksisi yoxlanmış JavaScript. | `lib/js-sixisdirici.ts`, `components/js-sixisdirici-tool.tsx`, `tests/js-sixisdirici.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
