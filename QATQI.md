# How this repository is built

This repository is generated. Every file in it is exported automatically from
the main project, `camalali`. Files here are not written by hand and should not
be. A change you make is not kept: the next export writes over the old state
and the change is lost.

**Bu sənəd iki dildədir. Azərbaycanca tam mətn:
[aşağıdakı bölmə](#azerbaycanca).**

## If you found a bug

Write through the contact form on camalali.com. The bug is not fixed here, it
is fixed in the source tool, and it arrives here with the next export. Do not
send a pull request to this repository. It will not be reviewed.

## If you have a suggestion

An idea for a new tool, a missing feature in an existing one, or a mistake in
the copy: write through the contact form on camalali.com. This repository is
refreshed on its own schedule. Your suggestion may show up in the next export
wave.

## If you want to send a fix

Fork the code and keep the fix in your own copy. The repository is MIT
licensed, so that workflow is supported. Do not wait on an upstream pull
request, either to this repository or to the main `camalali` project. Source
changes are made by the project owner only.

## How one tool is built

A tool is made of several files, tied together by the same `<slug>`:

- `lib/<slug>.ts`: dependency-free computation (no React, no DOM).
- `components/<slug>-tool.tsx`: the React and Tailwind 4 widget. It calls the
  `lib/` file and uses the shared primitives (`ui.tsx`, `tabs.tsx`,
  `reference-table.tsx`, `inline-code.tsx`).
- `api/<slug>/route.ts`: present only on the tools that send a request to an
  outside address. It depends on the `safe-url.ts`, `safe-fetch.ts`,
  `api-route.ts`, `api-cache.ts` and (on the raw-socket tools)
  `socket-probe.ts` fences.
- `tests/<slug>.mts`: the test set that runs with `pnpm test` and exercises the
  functions in the `lib/` file. The whole repository holds 2335 test
  cases across 161 test files. The tool you take comes with its
  own test, and you can run it in your project unchanged.
- The registry entry under `kateqoriya/`: the tool's name, description,
  keywords and the category it falls into.

The full explanation of the structure, and how to take each layer, is in
`ISTIFADE.md`. That includes the headers, the network fences and the
Azerbaijani-language traps. On the network tools especially, do not copy a
single file and run it without reading that document. Leave the fence files
out and what you have built is an open proxy.

---

<a id="azerbaycanca"></a>

# Bu repo necə qurulub

**In English: [the English section is at the top of this file](#how-this-repository-is-built).**

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
  yoxlayan test dəsti. Bütün repoda 2335 test halı və 161 test faylı var.
  Götürdüyün alət öz testi ilə gəlir. Onu öz layihəndə eynilə işlədə bilərsən.
- `kateqoriya/` altında reyestr girişi: alətin adı, təsviri, açar sözləri və
  hansı kateqoriyaya düşdüyü.

Quruluşun tam izahı və hər qatın necə götürülməsi `ISTIFADE.md`-dədir. Buraya
başlıq, şəbəkə hasarı və Azərbaycan dili tələsi də daxildir. Xüsusən şəbəkə
alətlərində oranı oxumadan tək faylı köçürüb işlətmə. Hasar faylları əskik
qalsa, açıq proksi qurmuş olursan.
