# Bu repo necə qurulub

Bu repo **generasiya olunur.** Burada gördüyün hər fayl `camalali` adlı əsas
layihədən avtomatik ixrac edilib — burada əl ilə fayl yazılmır və yazılmamalıdır.
Bura etdiyin dəyişiklik saxlanmır: növbəti ixrac köhnə vəziyyəti tamamilə
üstünə yazır və sənin dəyişikliyin izsiz gedir.

## Baq tapdınsa

camalali.com-dakı əlaqə formasından yaz. Baq burada düzəldilmir — mənbə
alətdə düzəldilir, sonra növbəti ixracla bura düşür. Bu repoya birbaşa pull
request göndərmə, o nəzərdən keçirilməyəcək.

## Təklif varsa

Yeni alət fikri, mövcud alətdə əskik funksiya, mətndə səhv — yenə eyni yol:
camalali.com-dakı əlaqə formasından yaz. Bu repo öz təqviminə görə yenilənir,
sənin təklifin bir sonrakı ixrac dalğasında görünə bilər.

## Düzəliş göndərmək istəyirsənsə

Kodu forkla, düzəlişini öz nüsxəndə saxla — bu, dəstəklənən bir iş axınıdır,
çünki repo MIT lisenziyalıdır. Amma yuxarı axına (bu repoya və ya əsas
`camalali` layihəsinə) PR gözləmə; mənbə dəyişikliyi yalnız layihə sahibi
tərəfindən edilir.

## Bir alət necə qurulub

Hər alət bir neçə fayldan ibarətdir, hamısı eyni `<slug>` adı ilə bağlanır:

- `lib/<slug>.ts` — asılılıqsız hesablama məntiqi (React-siz, DOM-suz).
- `components/<slug>-tool.tsx` — React + Tailwind 4 widget-i, `lib/` faylını
  çağırır və ortaq primitivlərdən (`ui.tsx`, `tabs.tsx`, `reference-table.tsx`,
  `inline-code.tsx`) istifadə edir.
- `api/<slug>/route.ts` — yalnız kənar ünvana sorğu göndərən alətlərdə var;
  `safe-url.ts`, `safe-fetch.ts`, `api-route.ts`, `api-cache.ts`,
  (xam soket alətlərində) `socket-probe.ts` hasarlarına bağlıdır.
- `tests/<slug>.mts` — `pnpm test` ilə işləyən, `lib/` faylının funksiyalarını
  yoxlayan test dəsti. Bütün repoda 2339 test halı, 158 test faylı var —
  götürdüyün alətin öz testi ilə gəlir, öz layihəndə eynilə işlədə bilərsən.
- `kateqoriya/` altında reyestr girişi — alətin adı, təsviri, açar sözləri,
  hansı kateqoriyaya düşdüyü.

Bu quruluşun tam izahı və hər qatı necə götürəcəyin — bir başlığa, bir
şəbəkə hasarına, bir Azərbaycan dili tələsinə qədər — `ISTIFADE.md`-dədir.
Oranı oxumadan tək bir faylı köçürüb işlətməyə çalışma, xüsusən şəbəkə
alətlərində: hasar faylları əskik qalsa, açıq proksi qurmuş olursan.
