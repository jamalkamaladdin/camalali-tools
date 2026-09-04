# Kod və inkişaf

JWT açır, UUID yaradır, regex sınayır və cron ifadəsini oxuyur. Mətn fərqini göstərir və SQL-i formatlayır.

13 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [JWT dekoderi](https://camalali.com/alet/jwt) | Token-i aç: header, payload və vaxtının bitib-bitmədiyi. | `lib/jwt.ts`, `components/jwt-tool.tsx` |  |
| [UUID generatoru](https://camalali.com/alet/uuid) | v4 və v7: sıralana bilən identifikator lazım olanda. | `lib/uuid.ts`, `components/uuid-tool.tsx` |  |
| [Regex test aləti](https://camalali.com/alet/regex) | İfadəni yaz, uyğunluqları və qrupları dərhal gör. | `lib/regex.ts`, `components/regex-tool.tsx` |  |
| [Cron ifadəsi izahçısı](https://camalali.com/alet/cron) | Beş sahəni sözlə izah edir, növbəti icra vaxtlarını göstərir. | `lib/cron.ts`, `components/cron-tool.tsx` |  |
| [Mətn fərqi (diff)](https://camalali.com/alet/ferq) | İki mətn arasındakı sətir fərqləri bir görünüşdə. | `lib/ferq.ts`, `components/ferq-tool.tsx`, `tests/ferq.mts` |  |
| [Markdown önizləməsi](https://camalali.com/alet/markdown) | Markdown yazdıqca nəticə canlı görünür, HTML mənbəyini də ayrıca kopyalaya bilirsən. | `lib/markdown.ts`, `components/markdown-tool.tsx`, `tests/markdown.mts` |  |
| [SQL formatlayıcı](https://camalali.com/alet/sql) | SQL üçün girintili və sıxışdırılmış görünüş. | `lib/sql.ts`, `components/sql-tool.tsx`, `tests/sql.mts` |  |
| [Unix vaxt çeviricisi](https://camalali.com/alet/vaxt) | Unix vaxt möhürünü tarixə, tarixi isə saniyə və ya millisaniyəlik vaxt möhürünə çevirə bilərsən. | `lib/vaxt.ts`, `components/vaxt-tool.tsx`, `tests/vaxt.mts` |  |
| [JSON struktur fərqi](https://camalali.com/alet/json-ferq) | İki JSON sənədi açar yolları üzrə müqayisə olunur; nəticə ağacla və RFC 6902 JSON Patch formatında verilir. | `lib/json-ferq.ts`, `components/json-ferq-tool.tsx`, `tests/json-ferq.mts` |  |
| [JSON-dan tip qurucusu](https://camalali.com/alet/json-tip) | Nümunə JSON TypeScript, Zod, Go, TypedDict və dataclass tiplərinə çevrilir. | `lib/json-tip.ts`, `components/json-tip-tool.tsx`, `tests/json-tip.mts` |  |
| [curl əmrindən kod çevirici](https://camalali.com/alet/curl-kod) | `curl` əmri yeddi dildə koda çevrilir; əks istiqamətdə `fetch` kodundan yenidən `curl` əmri alınır. | `lib/curl-kod.ts`, `components/curl-kod-tool.tsx`, `tests/curl-kod.mts` |  |
| [Regex izahçısı](https://camalali.com/alet/regex-izahci) | Regex naxışının ağac üzrə izahı və tanınan tələlər üçün xəbərdarlıqlar. | `lib/regex-izahci.ts`, `components/regex-izahci-tool.tsx`, `tests/regex-izahci.mts` |  |
| [Azərbaycan formatında test verilənləri](https://camalali.com/alet/test-verilenleri) | Seçdiyin sahə və say əsasında Azərbaycan formatlı uydurma test verilənləri JSON, CSV və ya SQL `INSERT` çıxışında qurulur. | `lib/test-verilenleri.ts`, `components/test-verilenleri-tool.tsx`, `tests/test-verilenleri.mts` |  |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
