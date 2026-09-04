# Sistem dizaynı

Sistem dizaynının hesabı: gündəlik sorğu sayından RPS, saxlama və server sayı, üstəlik baza ilə arxitektura seçimi.

10 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Yük və miqyas kalkulyatoru](https://camalali.com/alet/miqyas) | Gündəlik sorğu sayından RPS, saxlama və server sayını hesabla. | `lib/miqyas.ts`, `components/miqyas-tool.tsx` | — |
| [Arxitektura seçim köməkçisi](https://camalali.com/alet/arxitektura) | Bir neçə sual cavabla — tövsiyəni səbəbi ilə birlikdə al. | `lib/arxitektura.ts`, `components/arxitektura-tool.tsx` | — |
| [Gecikmə büdcəsi hesablayıcısı](https://camalali.com/alet/gecikme) | Mərhələlərini əlavə et, ümumi gecikməni və hədəfdən nə qədər kənara çıxdığını gör. | `lib/gecikme.ts`, `components/gecikme-tool.tsx`, `tests/gecikme.mts` | — |
| [Əlçatanlıq hesablayıcısı](https://camalali.com/alet/elcatanliq) | Faizi dayanma müddətinə, ya da dayanmanı faizə çevir; neçə komponent birlikdə nə qədər əlçatan olduğunu gör. | `lib/elcatanliq.ts`, `components/elcatanliq-tool.tsx`, `tests/elcatanliq.mts` | — |
| [Keş büdcəsi hesablayıcısı](https://camalali.com/alet/kesh) | Sorğu, açar sayı və keş ölçüsünü yaz — hit nisbətini, gecikməni və lazım olan yaddaşı gör. | `lib/kesh.ts`, `components/kesh-tool.tsx`, `tests/kesh.mts` | — |
| [Növbə və gözləmə hesablayıcısı](https://camalali.com/alet/novbe) | Gəliş sürəti, xidmət vaxtı və server sayından orta gözləməni və növbə uzunluğunu hesabla. | `lib/novbe.ts`, `components/novbe-tool.tsx`, `tests/novbe.mts` | — |
| [Şard və replika planlayıcısı](https://camalali.com/alet/shard) | Şard sayını dəyişmək açarların neçəsini köçürür — riyaziyyatını gör. | `lib/shard.ts`, `components/shard-tool.tsx`, `tests/shard.mts` | — |
| [Sürət həddi (rate limit) hesablayıcısı](https://camalali.com/alet/rate-limit) | Eyni həddi üç alqoritm fərqli tətbiq edir — sərhəddəki fərq rəqəmlə burada. | `lib/rate-limit.ts`, `components/rate-limit-tool.tsx`, `tests/rate-limit.mts` | — |
| [Jurnal (log) büdcəsi hesablayıcısı](https://camalali.com/alet/log-budcesi) | Log axını neçə GB-a çevrilir və nümunələmə nəyi riskə atır — rəqəmlə. | `lib/log-budcesi.ts`, `components/log-budcesi-tool.tsx`, `tests/log-budcesi.mts` | — |
| [CAP teoremi seçim bələdçisi](https://camalali.com/alet/cap-secimi) | Beş sual cavabla — sisteminin CP yoxsa AP tərəfdə olduğunu gör. | `lib/cap-secimi.ts`, `components/cap-secimi-tool.tsx`, `tests/cap-secimi.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
