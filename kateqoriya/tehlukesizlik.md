# Təhlükəsizlik

Güclü parol, hash, saytın müdafiə başlıqları və parolun məlum sızmalarda olub-olmadığının yoxlanışı.

13 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [HTTP təhlükəsizlik başlıqları](https://camalali.com/alet/basliqlar) | Ünvanı yaz — hansı qoruyucu başlığın çatmadığını rəqəmlə göstərir. | `lib/basliqlar.ts`, `components/basliqlar-tool.tsx`, `api/basliqlar/route.ts`, `tests/basliqlar.mts` | Yoxladığın saytın öz serveri |
| [Hash generatoru](https://camalali.com/alet/hash) | Mətni yaz — üç hash eyni anda çıxır. | `lib/hash.ts`, `components/hash-tool.tsx`, `tests/hash.mts` | — |
| [Parol sızıb-sızmadığını yoxla](https://camalali.com/alet/parol-sizmasi) | Parolun ictimai sızma bazasında neçə dəfə göründüyünü yoxlayır. | `lib/parol-sizmasi.ts`, `components/parol-sizmasi-tool.tsx`, `api/parol-sizmasi/route.ts`, `tests/parol-sizmasi.mts` | Have I Been Pwned — api.pwnedpasswords.com |
| [Təsadüfi parol generatoru](https://camalali.com/alet/parol) | Uzunluğu və simvol dəstini seç — parollar brauzerin kriptoqrafik mənbəyindən yaradılır. | `lib/parol.ts`, `components/parol-tool.tsx`, `tests/parol.mts` | — |
| [SSH açıq açar yoxlayıcısı](https://camalali.com/alet/ssh-parmaq-izi) | Açıq açarı yapışdır — parmaq izini, gücünü və giriş şərtlərini gör. | `lib/ssh-parmaq-izi.ts`, `components/ssh-parmaq-izi-tool.tsx`, `tests/ssh-parmaq-izi.mts` | — |
| [HMAC hesablayıcı](https://camalali.com/alet/hmac) | Mətni və açarı yaz — HMAC hex və Base64 kimi çıxır, tutuşdurma da mümkündür. | `lib/hmac.ts`, `components/hmac-tool.tsx`, `tests/hmac.mts` | — |
| [TOTP kod generatoru](https://camalali.com/alet/totp) | Base32 açarı yaz — cari, əvvəlki və növbəti TOTP kodu geri sayımla çıxır. | `lib/totp.ts`, `components/totp-tool.tsx`, `tests/totp.mts` | — |
| [JWT imzalama və yoxlama](https://camalali.com/alet/jwt-imza) | Açarla JWT imzala, ya da mövcud token-in imzasını həmin açarla yoxla. | `lib/jwt-imza.ts`, `components/jwt-imza-tool.tsx`, `tests/jwt-imza.mts` | — |
| [AES-GCM şifrələmə](https://camalali.com/alet/sifreleme) | Mətni parolla şifrələ — nəticə tək sətirlik paketdir, geri açmaq üçün eyni parol lazımdır. | `lib/sifreleme.ts`, `components/sifreleme-tool.tsx`, `tests/sifreleme.mts` | — |
| [bcrypt hash və yoxlama](https://camalali.com/alet/bcrypt) | Parolu bcrypt-lə hashla, cost-un real vaxtını gör, 72 baytdan uzunu tut. | `lib/bcrypt.ts`, `components/bcrypt-tool.tsx`, `tests/bcrypt.mts` | — |
| [RSA açar cütü, şifrələmə və imza](https://camalali.com/alet/rsa) | RSA açar cütü qur, PEM/JWK ixrac et, mətni şifrələ və ya imzala. | `lib/rsa.ts`, `components/rsa-tool.tsx`, `tests/rsa.mts` | — |
| [HTTP Basic Auth qurucusu](https://camalali.com/alet/basic-auth) | Ad və parolu yaz — Basic Auth başlığı çıxır, server konfiqurasiyası da hazırdır. | `lib/basic-auth.ts`, `components/basic-auth-tool.tsx`, `tests/basic-auth.mts` | — |
| [Content-Security-Policy qurucusu və izahçısı](https://camalali.com/alet/csp-qurucu) | Direktivləri seç — CSP çıxır. Mövcud CSP-ni yapışdır — zəiflikləri gör. | `lib/csp-qurucu.ts`, `components/csp-qurucu-tool.tsx`, `tests/csp-qurucu.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
