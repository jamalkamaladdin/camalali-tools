# Sistem dizaynı

Gündəlik sorğu sayına əsasən RPS, saxlama həcmi və server sayını hesablayır. Baza və arxitektura seçimini göstərir.

10 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [Yük və miqyas kalkulyatoru](https://camalali.com/alet/miqyas) | Gündəlik sorğu sayından RPS, saxlama və server sayını hesabla. | `lib/miqyas.ts`, `components/miqyas-tool.tsx` | — |
| [Arxitektura seçim köməkçisi](https://camalali.com/alet/arxitektura) | Bir neçə sual cavabla — tövsiyəni səbəbi ilə birlikdə al. | `lib/arxitektura.ts`, `components/arxitektura-tool.tsx` | — |
| [Gecikmə büdcəsi hesablayıcısı](https://camalali.com/alet/gecikme) | Mərhələ vaxtları ümumi gecikməyə çevrilir, hədəfdən kənarlaşma faizlə verilir. | `lib/gecikme.ts`, `components/gecikme-tool.tsx`, `tests/gecikme.mts` | — |
| [Əlçatanlıq hesablayıcısı](https://camalali.com/alet/elcatanliq) | SLA faizi ilə dayanma müddəti arasında çevirmə. | `lib/elcatanliq.ts`, `components/elcatanliq-tool.tsx`, `tests/elcatanliq.mts` | — |
| [Keş büdcəsi hesablayıcısı](https://camalali.com/alet/kesh) | Keş ölçüsünün hit nisbətinə, gecikməyə və mənbə yükünə təsirini hesablayır; bütün açarlar üçün yaddaş ehtiyacı da çıxır. | `lib/kesh.ts`, `components/kesh-tool.tsx`, `tests/kesh.mts` | — |
| [Növbə və gözləmə hesablayıcısı](https://camalali.com/alet/novbe) | Gəliş sürəti və server tutumu ilə orta gözləməni, növbə uzunluğunu və sistemdəki sorğu sayını tapırsan. | `lib/novbe.ts`, `components/novbe-tool.tsx`, `tests/novbe.mts` | — |
| [Şard və replika planlayıcısı](https://camalali.com/alet/shard) | Data artdıqca gələcək şard və disk ehtiyacı hesablanır; şard sayı dəyişəndə iki üsulun açar köçürmə faizi qarşılaşdırılır. | `lib/shard.ts`, `components/shard-tool.tsx`, `tests/shard.mts` | — |
| [Sürət həddi (rate limit) hesablayıcısı](https://camalali.com/alet/rate-limit) | Eyni sorğu həddi altında token bucket, sürüşən pəncərə və sabit pəncərə nəticələrinin yanaşı müqayisəsi. | `lib/rate-limit.ts`, `components/rate-limit-tool.tsx`, `tests/rate-limit.mts` | — |
| [Jurnal (log) büdcəsi hesablayıcısı](https://camalali.com/alet/log-budcesi) | Log axını üçün disk büdcəsi və nümunələmə riski. | `lib/log-budcesi.ts`, `components/log-budcesi-tool.tsx`, `tests/log-budcesi.mts` | — |
| [CAP teoremi seçim bələdçisi](https://camalali.com/alet/cap-secimi) | Bölünmə zamanı verilən beş cavabın CP və AP tərəflərinə təsiri, yekunda isə sistem üçün seçim bələdçisi. | `lib/cap-secimi.ts`, `components/cap-secimi-tool.tsx`, `tests/cap-secimi.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
