# Təhlükəsizlik

Parol və hash yaradır. Saytın müdafiə başlıqlarını və parolun məlum sızmalarda olub-olmadığını yoxlayır.

13 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [HTTP təhlükəsizlik başlıqları](https://camalali.com/alet/basliqlar) | Saytın qoruyucu HTTP başlıqları yoxlanıb A–F aralığında qiymətləndirilir. | `lib/basliqlar.ts`, `components/basliqlar-tool.tsx`, `api/basliqlar/route.ts`, `tests/basliqlar.mts` | Yoxladığın saytın öz serveri |
| [Hash generatoru](https://camalali.com/alet/hash) | Yazılan mətnin MD5, SHA-1 və SHA-256 nəticələri eyni ekranda. | `lib/hash.ts`, `components/hash-tool.tsx`, `tests/hash.mts` | — |
| [Parol sızıb-sızmadığını yoxla](https://camalali.com/alet/parol-sizmasi) | Parolun sızma bazasındakı sayı soruşulur; brauzerdən yalnız SHA-1 hash-in ilk 5 simvolu çıxır. | `lib/parol-sizmasi.ts`, `components/parol-sizmasi-tool.tsx`, `api/parol-sizmasi/route.ts`, `tests/parol-sizmasi.mts` | Have I Been Pwned — api.pwnedpasswords.com |
| [Təsadüfi parol generatoru](https://camalali.com/alet/parol) | Seçilən uzunluq və simvol dəstlərinə uyğun, brauzerdə yaradılan təsadüfi parollar. | `lib/parol.ts`, `components/parol-tool.tsx`, `tests/parol.mts` | — |
| [SSH açıq açar yoxlayıcısı](https://camalali.com/alet/ssh-parmaq-izi) | SSH açarının SHA256 və MD5 izləri, real gücü, şərhi və `authorized_keys` seçimləri bir baxışda. | `lib/ssh-parmaq-izi.ts`, `components/ssh-parmaq-izi-tool.tsx`, `tests/ssh-parmaq-izi.mts` | — |
| [HMAC hesablayıcı](https://camalali.com/alet/hmac) | Mətn və açar üçün HMAC-ı hex və Base64 formatında hesablayıb gözlənilən dəyərlə tutuşdura bilərsən. | `lib/hmac.ts`, `components/hmac-tool.tsx`, `tests/hmac.mts` | — |
| [TOTP kod generatoru](https://camalali.com/alet/totp) | Base32 açarla əvvəlki, cari və növbəti TOTP kodunu geri sayımla alırsan. | `lib/totp.ts`, `components/totp-tool.tsx`, `tests/totp.mts` | — |
| [JWT imzalama və yoxlama](https://camalali.com/alet/jwt-imza) | JWT-ni HS256, HS384 və ya HS512 ilə imzalaya, mövcud imzanı və vaxt sahələrini eyni yerdə yoxlaya bilərsən. | `lib/jwt-imza.ts`, `components/jwt-imza-tool.tsx`, `tests/jwt-imza.mts` | — |
| [AES-GCM şifrələmə](https://camalali.com/alet/sifreleme) | Paroldan törədilən açarla AES-256-GCM paketi yaratmaq və geri açmaq üçün. | `lib/sifreleme.ts`, `components/sifreleme-tool.tsx`, `tests/sifreleme.mts` | — |
| [bcrypt hash və yoxlama](https://camalali.com/alet/bcrypt) | bcrypt hash-i və yoxlaması, seçilən cost üçün ölçülən vaxt; 72 baytı aşan parol üçün ayrıca xəbərdarlıq. | `lib/bcrypt.ts`, `components/bcrypt-tool.tsx`, `tests/bcrypt.mts` | — |
| [RSA açar cütü, şifrələmə və imza](https://camalali.com/alet/rsa) | RSA açar cütü qurulur; mətn şifrələnir, açılır, imzalanır və yoxlanır. | `lib/rsa.ts`, `components/rsa-tool.tsx`, `tests/rsa.mts` | — |
| [HTTP Basic Auth qurucusu](https://camalali.com/alet/basic-auth) | Basic Auth başlığı və hazır server/`curl` sətirləri. | `lib/basic-auth.ts`, `components/basic-auth-tool.tsx`, `tests/basic-auth.mts` | — |
| [Content-Security-Policy qurucusu və izahçısı](https://camalali.com/alet/csp-qurucu) | CSP qurucusu və siyasət zəifliklərinin izahı. | `lib/csp-qurucu.ts`, `components/csp-qurucu-tool.tsx`, `tests/csp-qurucu.mts` | — |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
