# Bu repo necə qurulub

Bu repo generasiya olunur. Buradakı hər fayl `camalali` adlı əsas layihədən
avtomatik ixrac edilib. Burada fayllar əl ilə yazılmır və yazılmamalıdır.
Etdiyin dəyişiklik saxlanmır. Növbəti ixrac köhnə vəziyyətin üstünə yazır və
dəyişiklik itir.

## Baq tapdınsa

camalali.com-dakı əlaqə formasından yaz. Baq burada deyil, mənbə alətdə
düzəldilir. Sonra növbəti ixracla bura düşür. Bu repoya birbaşa pull request
göndərmə. O, nəzərdən keçirilməyəcək.

## Təklif varsa

Yeni alət fikri, mövcud alətdə əskik funksiya və ya mətndə səhv üçün
camalali.com-dakı əlaqə formasından yaz. Bu repo öz təqviminə görə yenilənir.
Təklifin bir sonrakı ixrac dalğasında görünə bilər.

## Düzəliş göndərmək istəyirsənsə

Kodu forkla və düzəlişi öz nüsxəndə saxla. Repo MIT lisenziyalı olduğu üçün bu
iş axını dəstəklənir. Yuxarı axına (bu repoya və ya əsas `camalali` layihəsinə)
PR gözləmə. Mənbə dəyişikliyini yalnız layihə sahibi edir.

## Bir alət necə qurulub

Hər alət bir neçə fayldan ibarətdir. Onlar eyni `<slug>` adı ilə bağlanır:

- `lib/<slug>.ts`: asılılıqsız hesablama məntiqi (React-siz, DOM-suz).
- `components/<slug>-tool.tsx`: React + Tailwind 4 widget-i, `lib/` faylını
  çağırır və ortaq primitivlərdən (`ui.tsx`, `tabs.tsx`, `reference-table.tsx`,
  `inline-code.tsx`) istifadə edir.
- `api/<slug>/route.ts`: yalnız kənar ünvana sorğu göndərən alətlərdə var.
  `safe-url.ts`, `safe-fetch.ts`, `api-route.ts`, `api-cache.ts`,
  (xam soket alətlərində) `socket-probe.ts` hasarlarına bağlıdır.
- `tests/<slug>.mts`: `pnpm test` ilə işləyən və `lib/` faylının funksiyalarını
  yoxlayan test dəsti. Bütün repoda 2339 test halı və 158 test faylı var.
  Götürdüyün alət öz testi ilə gəlir. Onu öz layihəndə eynilə işlədə bilərsən.
- `kateqoriya/` altında reyestr girişi: alətin adı, təsviri, açar sözləri və
  hansı kateqoriyaya düşdüyü.

Quruluşun tam izahı və hər qatın necə götürülməsi `ISTIFADE.md`-dədir. Buraya
başlıq, şəbəkə hasarı və Azərbaycan dili tələsi də daxildir. Xüsusən şəbəkə
alətlərində oranı oxumadan tək faylı köçürüb işlətmə. Hasar faylları əskik
qalsa, açıq proksi qurmuş olursan.
