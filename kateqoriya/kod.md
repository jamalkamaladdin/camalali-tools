# Kod və inkişaf

JWT açmaq, UUID yaratmaq, regex sınamaq, cron ifadəsini oxumaq, mətn fərqini görmək və SQL-i formatlamaq — gündəlik kod işi.

13 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [JWT dekoderi](https://camalali.com/alet/jwt) | Token-i aç — header, payload və vaxtının bitib-bitmədiyi. | `lib/jwt.ts`, `components/jwt-tool.tsx` | — |
| [UUID generatoru](https://camalali.com/alet/uuid) | v4 və v7 — sıralana bilən identifikator lazım olanda. | `lib/uuid.ts`, `components/uuid-tool.tsx` | — |
| [Regex test aləti](https://camalali.com/alet/regex) | İfadəni yaz, uyğunluqları və qrupları dərhal gör. | `lib/regex.ts`, `components/regex-tool.tsx` | — |
| [Cron ifadəsi izahçısı](https://camalali.com/alet/cron) | Beş sahəni sözlə izah edir, növbəti icra vaxtlarını göstərir. | `lib/cron.ts`, `components/cron-tool.tsx` | — |
| [Mətn fərqi (diff)](https://camalali.com/alet/ferq) | İki mətni yapışdır — hansı sətrin əlavə olunduğunu, silindiyini və dəyişmədiyini gör. | `lib/ferq.ts`, `components/ferq-tool.tsx`, `tests/ferq.mts` | — |
| [Markdown önizləməsi](https://camalali.com/alet/markdown) | Solda markdown, sağda canlı nəticə — HTML mənbəyi kopyalana bilir. | `lib/markdown.ts`, `components/markdown-tool.tsx`, `tests/markdown.mts` | — |
| [SQL formatlayıcı](https://camalali.com/alet/sql) | Bir sətrə yığılmış sorğunu yapışdır — açar sözlər öz sətrinə düşür, sütunlar girintilənir. | `lib/sql.ts`, `components/sql-tool.tsx`, `tests/sql.mts` | — |
| [Unix vaxt çeviricisi](https://camalali.com/alet/vaxt) | Unix vaxt möhürünü tarixə, tarixi vaxt möhürünə çevir. | `lib/vaxt.ts`, `components/vaxt-tool.tsx`, `tests/vaxt.mts` | — |
| [JSON struktur fərqi](https://camalali.com/alet/json-ferq) | İki JSON-u yapışdır — hansı açarın əlavə, silinmə, dəyişmə keçdiyini yolu ilə gör. | `lib/json-ferq.ts`, `components/json-ferq-tool.tsx`, `tests/json-ferq.mts` | — |
| [JSON-dan tip qurucusu](https://camalali.com/alet/json-tip) | Nümunə JSON-u yapışdır — TypeScript, Zod, Go, Python tipini eyni anda al. | `lib/json-tip.ts`, `components/json-tip-tool.tsx`, `tests/json-tip.mts` | — |
| [curl əmrindən kod çevirici](https://camalali.com/alet/curl-kod) | curl əmrini yapışdır — yeddi dildə kodunu al, ya da tərsinə çevir. | `lib/curl-kod.ts`, `components/curl-kod-tool.tsx`, `tests/curl-kod.mts` | — |
| [Regex izahçısı](https://camalali.com/alet/regex-izahci) | Regex naxışını yapışdır — hər hissənin nə tutduğunu ağac şəklində gör. | `lib/regex-izahci.ts`, `components/regex-izahci-tool.tsx`, `tests/regex-izahci.mts` | — |
| [Azərbaycan formatında test verilənləri](https://camalali.com/alet/test-verilenleri) | Sahələri seç, sətir sayını yaz — Azərbaycan formatında uydurma test verilənləri al. | `lib/test-verilenleri.ts`, `components/test-verilenleri-tool.tsx`, `tests/test-verilenleri.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
