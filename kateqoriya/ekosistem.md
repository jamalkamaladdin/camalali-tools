# Paket və ekosistem

npm paketinin versiyasını, ölçüsünü və asılılıqlarını göstərir. GitHub profilinin fəaliyyət məlumatını da alır.

7 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [GitHub profil və repo kartı](https://camalali.com/alet/github) | İstifadəçi adı profil kartına çevrilir; owner/repo formatında giriş isə həmin repoya aid ayrıca kart açır. | `lib/github.ts`, `components/github-tool.tsx`, `api/github/route.ts`, `tests/github.mts` | GitHub REST API (api.github.com) |
| [npm paket baxıcısı](https://camalali.com/alet/npm) | Yazdığın npm paketi üzrə son versiya və lisenziya ilə yanaşı, asılılıq sayına və repo ünvanına da baxa bilərsən. | `lib/npm.ts`, `components/npm-tool.tsx`, `api/npm/route.ts`, `tests/npm.mts` | npm reyestri (registry.npmjs.org) |
| [PyPI paket müfəttişi](https://camalali.com/alet/pypi) | PyPI paketinin versiyası, lisenziyası və asılılıqları ilə birlikdə son 5 buraxılışın tarixləri də burada görünür. | `lib/pypi.ts`, `components/pypi-tool.tsx`, `api/pypi/route.ts`, `tests/pypi.mts` | PyPI (pypi.org) |
| [Docker Hub image müfəttişi](https://camalali.com/alet/docker-hub) | Image məlumatı və son 10 teqin ölçüsü bir ekranda. | `lib/docker-hub.ts`, `components/docker-hub-tool.tsx`, `api/docker-hub/route.ts`, `tests/docker-hub.mts` | Docker Hub (hub.docker.com) |
| [Composer/PHP paket müfəttişi](https://camalali.com/alet/packagist) | Paket adına görə sabit versiya, PHP tələbi, lisenziya və yükləmə sayı. | `lib/packagist.ts`, `components/packagist-tool.tsx`, `api/packagist/route.ts`, `tests/packagist.mts` | Packagist (packagist.org) |
| [Rust crate müfəttişi](https://camalali.com/alet/crates) | Crate adını yazırsan; versiya, yükləmə sayı, lisenziya və son 5 buraxılış bir ekranda qarşına çıxır. | `lib/crates.ts`, `components/crates-tool.tsx`, `api/crates/route.ts`, `tests/crates.mts` | crates.io |
| [Go modul müfəttişi](https://camalali.com/alet/go-modul) | Modul yolu, son versiya, tarix və go get əmri. | `lib/go-modul.ts`, `components/go-modul-tool.tsx`, `api/go-modul/route.ts`, `tests/go-modul.mts` | Go modul proxy-si (proxy.golang.org) |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
