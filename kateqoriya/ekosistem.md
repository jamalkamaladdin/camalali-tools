# Paket və ekosistem

npm paketinin və GitHub profilinin canlı məlumatı — versiya, ölçü, asılılıq və fəaliyyət.

7 alət.

| Alət | Nə edir | Fayllar | Xarici xidmət |
|---|---|---|---|
| [GitHub profil və repo kartı](https://camalali.com/alet/github) | Ad yazsan profil, owner/repo yazsan repo kartı çıxır. | `lib/github.ts`, `components/github-tool.tsx`, `api/github/route.ts`, `tests/github.mts` | GitHub REST API (api.github.com) |
| [npm paket baxıcısı](https://camalali.com/alet/npm) | Paket adını yaz — son versiya, lisenziya, asılılıq sayı və repo ünvanı çıxır. | `lib/npm.ts`, `components/npm-tool.tsx`, `api/npm/route.ts`, `tests/npm.mts` | npm reyestri (registry.npmjs.org) |
| [PyPI paket müfəttişi](https://camalali.com/alet/pypi) | Paket adını yaz — versiya, lisenziya, asılılıq siyahısı və son 5 buraxılış tarixi ilə çıxır. | `lib/pypi.ts`, `components/pypi-tool.tsx`, `api/pypi/route.ts`, `tests/pypi.mts` | PyPI (pypi.org) |
| [Docker Hub image müfəttişi](https://camalali.com/alet/docker-hub) | Image adını yaz — təsvir, ulduz, yükləmə sayı və son 10 teqin ölçüsü ilə çıxır. | `lib/docker-hub.ts`, `components/docker-hub-tool.tsx`, `api/docker-hub/route.ts`, `tests/docker-hub.mts` | Docker Hub (hub.docker.com) |
| [Composer/PHP paket müfəttişi](https://camalali.com/alet/packagist) | Paket adını yaz — sabit versiya, tələb olunan PHP, lisenziya və yükləmə sayı ilə çıxır. | `lib/packagist.ts`, `components/packagist-tool.tsx`, `api/packagist/route.ts`, `tests/packagist.mts` | Packagist (packagist.org) |
| [Rust crate müfəttişi](https://camalali.com/alet/crates) | Crate adını yaz — versiya, yükləmə sayı, lisenziya və son 5 buraxılış ilə çıxır. | `lib/crates.ts`, `components/crates-tool.tsx`, `api/crates/route.ts`, `tests/crates.mts` | crates.io |
| [Go modul müfəttişi](https://camalali.com/alet/go-modul) | Modul yolunu yaz — son versiyanı, tarixini və go get əmrini gör. | `lib/go-modul.ts`, `components/go-modul-tool.tsx`, `api/go-modul/route.ts`, `tests/go-modul.mts` | Go modul proxy-si (proxy.golang.org) |

[← bütün kateqoriyalar](../README.md#kateqoriyalar)
