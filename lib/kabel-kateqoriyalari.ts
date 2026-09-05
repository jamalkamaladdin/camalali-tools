/**
 * Network cabling and connector reference: what a copper category, a shield
 * code, a fibre type or a connector is rated for, so it can be chosen or
 * checked without opening the TIA-568, ISO/IEC 11801 or IEEE 802.3 documents
 * themselves.
 *
 * Rows are grouped the way an installer actually reaches for one: the copper
 * category itself (`mis`), the shielding code printed on its jacket
 * (`ekran`), the optical fibre and its connectors for runs past copper's
 * reach (`fiber`), and the connectors, pinouts and power standards that sit
 * at either end of the cable (`konnektor`). A category's name means little
 * read alone — `term` carries the short form a visitor already has in front
 * of them (`Cat6`, `S/FTP`, `OM4`), `label` carries the figure they are
 * actually after (a speed, a distance, a wattage), so a search for either
 * the name or the number lands on the same row.
 *
 * Every figure here is checkable against a primary source, and where the
 * documented number and the real-world number differ, the note gives both
 * rather than picking the friendlier one: Cat6's 55 m distance for
 * 10 Gbit/s dropping to 37 m under heavy alien crosstalk, the 100 m channel
 * actually being 90 m of solid horizontal cable plus 10 m of stranded patch
 * leads, PoE's wattage at the switch versus the smaller wattage that
 * actually reaches the device.
 */
import type { ReferenceRow, ReferenceSection } from "./reference.js";

export const kabelKateqoriyalariSections: ReferenceSection[] = [
  { id: "mis", label: "Mis kabel (twisted pair)" },
  {
    id: "ekran",
    label: "Ekranlama kodları",
    hint: "Kod kəsr işarəsi ilə yazılır: kabelin ümumi ekranı / hər cütün öz ekranı.",
  },
  { id: "fiber", label: "Optik lif və konnektoru" },
  {
    id: "konnektor",
    label: "Mis konnektor, pinout və güc",
    hint: "RJ45 pin sxemindən PoE gücünə və SFP/QSFP transceiver formatlarına qədər kabelin hər iki ucundakı hissələr.",
  },
];

export const kabelKateqoriyalariRows: ReferenceRow[] = [
  /* ---------- mis ---------- */
  {
    term: "Cat3",
    label: "10 Mbit/s, 100 m (16 MHz)",
    note: "10BASE-T Ethernet və analoq telefon xətləri üçün yazılmış köhnə standartdır. Bu gün yeni quraşdırmada işlədilmir, yalnız köhnə bina kabelində qalır.",
    section: "mis",
    example: "Analoq PBX telefon xətti, köhnə 10BASE-T şəbəkə kartı",
    match: ["kateqoriya 3", "10base-t"],
  },
  {
    term: "Cat5",
    label: "100 Mbit/s, 100 m (100 MHz)",
    note: "100BASE-TX sürətini daşıyan standartdır, TIA-568-C ilə rəsmən Cat5e-nin xeyrinə geri çəkilib. Bu gün satılan kabel demək olar həmişə Cat5e-dir.",
    section: "mis",
    example: "Köhnə 100BASE-TX şəbəkə kartı, 2000-ci illər ofis kabeli",
    match: ["kateqoriya 5", "100base-tx"],
  },
  {
    term: "Cat5e",
    label: "1 Gbit/s, 100 m (100 MHz)",
    note: "1000BASE-T-ni tam 100 metrə çatdırır və praktikada 2.5GBASE-T-ni də eyni 100 metrə daşıyır. 100 metrlik kanal əslində 90 metr sərt horizontal kabel və 10 metr çevik patch-koddan ibarətdir. Bu bölgü Cat3-dən Cat8.2-yə qədər hamısına aiddir.",
    section: "mis",
    example: "Ev və ofis şəbəkəsi, 1 Gbit/s switch bağlantısı",
    match: ["kateqoriya 5e", "1000base-t", "2.5gbase-t"],
  },
  {
    term: "Cat6",
    label: "1 Gbit/s / 100 m, 10 Gbit/s / 55 m (250 MHz)",
    note: "1000BASE-T-ni tam 100 metrə aparır, amma 10GBASE-T yalnız 55 metrə qədər zəmanətlidir; güclü alien crosstalk olan bağlamalarda bu məsafə 37 metrə qədər düşür.",
    section: "mis",
    example: "1 Gbit/s şəbəkə, qısa məsafədə 10 Gbit/s uplink",
    match: ["kateqoriya 6", "10gbase-t", "alien crosstalk"],
  },
  {
    term: "Cat6a",
    label: "10 Gbit/s, 100 m (500 MHz)",
    note: "10GBASE-T-ni tam 100 metrlik kanalda zəmanətli sürətlə verir: Cat6-dan fərqli olaraq məsafə güzəştə getmir, bu gün yeni çəkilən hər kabel üçün dürüst tövsiyədir.",
    section: "mis",
    example: "Yeni bina kabeli, data-mərkəzi horizontal bağlantı",
    match: ["kateqoriya 6a", "augmented", "10gbase-t"],
  },
  {
    term: "Cat7",
    label: "10 Gbit/s+, 100 m (600 MHz), GG45/TERA",
    note: "ISO/IEC-in Class F spesifikasiyasıdır və TIA tərəfindən rəsmən tanınmır. Spesifikasiya adi RJ45 yox, GG45 və ya TERA konnektoru tələb edir. Adi RJ45 başlı 'Cat7' kabel satışı bu standartın özü deyil, mis kabel bazarında ən çox yanlış satılan şeydir.",
    section: "mis",
    example: "Yalnız GG45/TERA konnektorlu Avropa quraşdırmaları",
    match: ["class f", "gg45", "tera"],
  },
  {
    term: "Cat7a",
    label: "10 Gbit/s+, 100 m (1000 MHz), GG45/TERA",
    note: "ISO/IEC-in Class FA spesifikasiyasıdır, Cat7 kimi TIA tərəfindən tanınmır və eyni GG45/TERA konnektorunu tələb edir: zolaq genişliyi ikiqat yüksəkdir, gələcək yüksək sürətlər üçün ehtiyat marja verir.",
    section: "mis",
    example: "Yüksək tezlikli Avropa data-mərkəzi kabeli",
    match: ["class fa", "gg45", "tera"],
  },
  {
    term: "Cat8.1",
    label: "25/40 Gbit/s, 30 m (2000 MHz), RJ45-uyğun",
    note: "ISO/IEC-in Class I spesifikasiyasıdır, 25GBASE-T və 40GBASE-T sürətini yalnız 30 metrə qədər verir. Bina kabeli deyil, data-mərkəzində top-of-rack switch ilə server arasındakı qısa bağlantı üçün nəzərdə tutulub. Adi RJ45 ilə geriyə uyğundur.",
    section: "mis",
    example: "Top-of-rack switch: server rack bağlantısı",
    match: ["class i", "kateqoriya 8", "25gbase-t", "40gbase-t"],
  },
  {
    term: "Cat8.2",
    label: "25/40 Gbit/s, 30 m (2000 MHz), qeyri-RJ45",
    note: "Cat8.1 ilə eyni 30 metrlik məsafəni və sürəti verir, amma ISO/IEC-in Class II spesifikasiyasıdır və adi RJ45 əvəzinə GG45 tipli qeyri-RJ45 konnektor tələb edir.",
    section: "mis",
    example: "Qeyri-RJ45 konnektorlu data-mərkəzi kabeli",
    match: ["class ii", "kateqoriya 8", "gg45"],
  },

  /* ---------- ekran ---------- */
  {
    term: "X/YTP notasiyası",
    label: "Kodun necə oxunması",
    note: "Kəsr işarəsindən əvvəlki hərf kabelin ÜMUMİ ekranını göstərir (U=yoxdur, F=folqa, S=hörmə), sonrakı YTP isə hər cütün öz ekranını bildirir: TP ekransız cüt, FTP folqalı cüt, STP hörməli cüt deməkdir.",
    section: "ekran",
    example: "S/FTP = hörmə ümumi ekran + folqalı hər cüt",
    match: ["screen tp", "kod oxunusu"],
  },
  {
    term: "U/UTP",
    label: "Ekransız (UTP)",
    note: "Nə ümumi, nə cüt səviyyəsində heç bir ekran yoxdur. Ən ucuz və ən çevik variantdır, adi ofis şəbəkəsində kifayət edir.",
    section: "ekran",
    example: "Ev və kiçik ofis şəbəkəsi",
    match: ["unshielded", "utp"],
  },
  {
    term: "F/UTP",
    label: "Folqalı ümumi ekran (FTP)",
    note: "Bütün dörd cütün üstündən tək folqa qatı keçir, cütlərin özü isə ekransızdır: adi UTP-dən daha yaxşı EMI qorunması verir, bazarda tez-tez qısaca FTP adlanır.",
    section: "ekran",
    example: "Sənaye mühitinə yaxın ofis kabeli",
    match: ["foil utp", "ftp"],
  },
  {
    term: "S/FTP",
    label: "Hörmə ümumi + folqalı cüt",
    note: "Ən güclü qorunma verən kombinasiyalardan biridir. Kabelin bütövündə hörmə metal ekran, hər cütün də öz folqası var; Cat6a və Cat7 quraşdırmalarında standart seçimdir.",
    section: "ekran",
    example: "Data-mərkəzi və güclü EMI olan sənaye sahəsi",
    match: ["braid foil", "screened foiled"],
  },
  {
    term: "SF/UTP",
    label: "Folqa+hörmə ümumi ekran",
    note: "Ümumi ekran həm folqa, həm hörmədən ibarətdir, amma cütlərin öz ekranı yoxdur, F/UTP-dən güclü, S/FTP-dən sadədir.",
    section: "ekran",
    example: "Elektromaqnit maneəsi orta səviyyəli mühit",
    match: ["braid foil utp"],
  },
  {
    term: "U/FTP",
    label: "Ekransız ümumi, folqalı cüt",
    note: "Ümumi ekran yoxdur, amma hər cüt öz folqasına bükülüb: məqsəd cütlər arası (alien) crosstalk-ı azaltmaqdır, xarici EMI-dən tam qorumur.",
    section: "ekran",
    example: "Cütlərarası siqnal sızmasının kritik olduğu kabel",
    match: ["unshielded foiled"],
  },
  {
    term: "S/STP",
    label: "Hörmə ümumi + hörməli cüt",
    note: "Həm ümumi, həm hər cüt üzərində hörmə metal ekran var. Folqadan daha davamlıdır, amma daha qalın və sərt kabel deməkdir.",
    section: "ekran",
    example: "Ağır sənaye və yüksək tezlikli quraşdırma",
    match: ["braid screened", "stp"],
  },
  {
    term: "Ekranın torpaqlanması",
    label: "Hər iki ucda bağlı olmalıdır",
    note: "Ekranlı kabel yalnız hər iki ucda düzgün torpaqlanmış patch panel və ya konnektorla işə yarayır; bir uc bağlı, digəri bağlı deyilsə, ekran qorumaq əvəzinə antenaya çevrilir və nəticə ekransız kabeldən də pisdir.",
    section: "ekran",
    example: "İki ucda da torpaqlanmış patch panel",
    match: ["bonding", "earthing", "torpaqlama"],
  },

  /* ---------- fiber ---------- */
  {
    term: "OM1",
    label: "62.5 µm nüvə, narıncı",
    note: "Lazer-optimallaşdırılmamış köhnə multimode lifdir, 10GBASE-SR ilə cəmi 33 metrə qədər işləyir və 40/100 Gbit/s parallel optikaya ümumiyyətlə uyğun deyil. Yeni quraşdırmada seçilmir.",
    section: "fiber",
    example: "Köhnə bina daxili şəbəkəsi, 10 Gbit/s-dən aşağı",
    match: ["multimode", "62.5/125"],
  },
  {
    term: "OM2",
    label: "50 µm nüvə, narıncı",
    note: "OM1-dən geniş zolaqlıdır, 10GBASE-SR ilə təxminən 82 metrə çatır, amma lazer-optimallaşdırılmamışdır və 40/100 Gbit/s-ə uyğun deyil.",
    section: "fiber",
    example: "2000-ci illərin ofis binası kabeli",
    match: ["multimode", "50/125"],
  },
  {
    term: "OM3",
    label: "50 µm lazer-optimallı, akva",
    note: "Lazer-optimallaşdırılmış ilk nəsildir: 10 Gbit/s-i 300 metrə, 40/100 Gbit/s parallel optikanı isə 100 metrə qədər daşıyır.",
    section: "fiber",
    example: "Orta ölçülü data-mərkəzi backbone kabeli",
    match: ["laser optimized multimode", "40gbase-sr4", "100gbase-sr4"],
  },
  {
    term: "OM4",
    label: "50 µm lazer-optimallı, bənövşəyi",
    note: "OM3-dən daha geniş zolaq verir: 10 Gbit/s-i 400 metrə, 40/100 Gbit/s-i isə 150 metrə qədər aparır.",
    section: "fiber",
    example: "Böyük data-mərkəzi, uzun rack sıraları arası",
    match: ["laser optimized multimode", "40gbase-sr4", "100gbase-sr4"],
  },
  {
    term: "OM5",
    label: "50 µm geniş zolaqlı, lime yaşıl",
    note: "SWDM (qısa dalğa bölgülü multipleksləmə) üçün nəzərdə tutulub. Eyni lif cütü üzərində bir neçə dalğa uzunluğunu daşıyaraq lazım olan lif sayını azaldır; məsafə göstəriciləri OM4 ilə demək olar eynidir.",
    section: "fiber",
    example: "Çoxdalğalı (SWDM) transceiver quraşdırması",
    match: ["wideband multimode", "swdm"],
  },
  {
    term: "OS1",
    label: "9 µm nüvə, tək rejim",
    note: "Bina daxili və qısa məsafəli sıx buferlənmiş (tight-buffered) singlemode kabeldir, tipik olaraq bir neçə kilometrə qədər işlədilir.",
    section: "fiber",
    example: "Bina daxili backbone, kampus şəbəkəsi",
    match: ["singlemode", "tight buffered", "9/125"],
  },
  {
    term: "OS2",
    label: "9 µm nüvə, tək rejim",
    note: "Aşağı su-zirvəli (low water peak) lifdən hazırlanan boş borulu (loose-tube) çöl kabelidir, gücləndirici olmadan onlarla kilometrə qədər çata bilir.",
    section: "fiber",
    example: "Şəhərlərarası magistral, ISP backbone",
    match: ["singlemode", "loose tube", "9/125"],
  },
  {
    term: "LC konnektor",
    label: "Kiçik forma, 1.25 mm ferrul",
    note: "Bu gün data-mərkəzlərində ən çox rast gəlinən optik konnektordur: kiçik ölçüsü sayəsində eyni sahədə SC-dən iki qat çox port sığdırır, mancanaqlı kilidlə taxılır.",
    section: "fiber",
    example: "SFP+ transceiver portu",
    match: ["lucent connector", "small form"],
  },
  {
    term: "SC konnektor",
    label: "Kvadrat gövdə, 2.5 mm ferrul",
    note: "İtələ-çıxar (push-pull) mexanizmli köhnə nəsil konnektordur, telekom və PON (GPON) avadanlığında hələ geniş işlədilir.",
    section: "fiber",
    example: "GPON ONT portu",
    match: ["subscriber connector", "push pull"],
  },
  {
    term: "ST konnektor",
    label: "Bayonet kilid, 2.5 mm ferrul",
    note: "Fırladıb kilidlənən bayonet konnektordur. 1990-2000-ci illərin multimode quraşdırmalarında standart idi, yeni layihələrdə nadir seçilir.",
    section: "fiber",
    example: "Köhnə multimode patch-panel",
    match: ["straight tip", "bayonet"],
  },
  {
    term: "FC konnektor",
    label: "Vintli kilid, 2.5 mm ferrul",
    note: "Vintlə bərkidilən konnektordur, titrəyişə davamlılığı sayəsində telekom ötürücü avadanlıqda və ölçü cihazlarında üstünlük tutur.",
    section: "fiber",
    example: "Telekom ötürücü avadanlıq, optik ölçü cihazı",
    match: ["ferrule connector", "threaded"],
  },
  {
    term: "MPO/MTP konnektor",
    label: "Çoxlifli, 12 və ya 24 lif",
    note: "Tək bir konnektorda 12 və ya 24 lifi birləşdirir: 40GBASE-SR4 və 100GBASE-SR4 kimi paralel optika tətbiqlərinin standart konnektorudur; MTP, US Conec-in MPO ilə mexaniki uyğun ticari markasıdır.",
    section: "fiber",
    example: "40/100 Gbit/s paralel optika bağlantısı",
    match: ["multi fiber push on", "parallel optics"],
  },

  /* ---------- konnektor ---------- */
  {
    term: "RJ45 (8P8C)",
    label: "8 pin, 8 kontakt",
    note: "Düzgün texniki adı 8P8C-dir (8 mövqe, 8 kontakt). 'RJ45' termini əslində fərqli bir telefon standartından götürülüb, amma bazarda hamı bunu Ethernet konnektoru kimi tanıyır.",
    section: "konnektor",
    example: "Bütün mis Ethernet kabellərinin standart konnektoru",
    match: ["8p8c", "ethernet konnektoru"],
  },
  {
    term: "T568A",
    label: "Pin-rəng sırası (dövlət standartı)",
    note: "TIA-568-in iki rəsmi pin-rəng sxemindən biridir: yaşıl cüt 1-2, narıncı cüt 3-6 pinlərinə düşür; ABŞ federal dövlət qurumlarının defolt tələbidir, adi düz kabeldə hər iki uc eyni sxemlə hörülür.",
    section: "konnektor",
    example:
      "1: ağ-yaşıl\n2: yaşıl\n3: ağ-narıncı\n4: mavi\n5: ağ-mavi\n6: narıncı\n7: ağ-qəhvəyi\n8: qəhvəyi",
    match: ["pin sxemi", "pinout"],
  },
  {
    term: "T568B",
    label: "Pin-rəng sırası (kommersiya standartı)",
    note: "TIA-568-in ikinci pin-rəng sxemidir: narıncı cüt 1-2, yaşıl cüt 3-6 pinlərinə düşür; kommersiya quraşdırmalarında ən çox rast gəlinən defolt seçimdir, adi düz kabeldə hər iki uc eyni sxemlə hörülür.",
    section: "konnektor",
    example:
      "1: ağ-narıncı\n2: narıncı\n3: ağ-yaşıl\n4: mavi\n5: ağ-mavi\n6: yaşıl\n7: ağ-qəhvəyi\n8: qəhvəyi",
    match: ["pin sxemi", "pinout"],
  },
  {
    term: "Crossover kabel",
    label: "Bir uc T568A, digər uc T568B",
    note: "Bir ucu T568A, digər ucu T568B ilə hörülən kabeldir. Göndərmə və qəbul cütlərini çarpaz bağlayaraq iki oxşar cihazı (məsələn iki kompüteri) keçidsiz birləşdirməyə imkan verirdi.",
    section: "konnektor",
    example: "PC-dən PC-yə birbaşa bağlantı (keçid olmadan)",
    match: ["crossover", "çarpaz kabel"],
  },
  {
    term: "Auto-MDI-X",
    label: "Portun avtomatik uyğunlaşması",
    note: "Müasir Ethernet portları hansı cütün göndərmə, hansının qəbul olduğunu avtomatik aşkarlayır: bu, crossover kabelini praktikada lazımsız edib, bu gün demək olar bütün bağlantılarda adi düz (straight-through) kabel kifayət edir.",
    section: "konnektor",
    example: "Gigabit portlar arası birbaşa adi kabel",
    match: ["auto mdix", "avtomatik uyğunlaşma"],
  },
  {
    term: "RJ11",
    label: "6P, adətən 2 və ya 4 kontakt",
    note: "Analoq telefon xəttinin konnektorudur. RJ45-in 8 mövqeli gövdəsindən fərqli olaraq 6 mövqəlidir və adətən yalnız orta iki və ya dörd kontakt bağlanır; ADSL modem xətti də adətən bu konnektorla gəlir.",
    section: "konnektor",
    example: "Ev telefon rozetkası, DSL modem xətti",
    match: ["telefon konnektoru", "6p2c", "6p4c"],
  },
  {
    term: "802.3af (PoE)",
    label: "15.4 W (switch) → ~12.95 W (cihaz)",
    note: "İlk rəsmi PoE standartıdır: switch 15.4 vatt göndərir, amma kabeldəki güc itkisi səbəbindən cihazın özünə çatan zəmanətli güc təxminən 12.95 vattdır; IP telefon və əsas Wi-Fi nöqtəsi üçün kifayət edir.",
    section: "konnektor",
    example: "IP telefon, əsas Wi-Fi nöqtəsi",
    match: ["poe", "power over ethernet"],
  },
  {
    term: "802.3at (PoE+)",
    label: "30 W (switch) → ~25.5 W (cihaz)",
    note: "PoE+ olaraq tanınır: switch 30 vatt göndərir, cihaza çatan zəmanətli güc təxminən 25.5 vattdır; PTZ kamera və yüksək performanslı access point kimi cihazlar üçün nəzərdə tutulub.",
    section: "konnektor",
    example: "PTZ təhlükəsizlik kamerası, güclü access point",
    match: ["poe+", "poe plus"],
  },
  {
    term: "802.3bt Type 3 (PoE++)",
    label: "60 W (switch) → ~51 W (cihaz)",
    note: "Dörd cütün hamısını gücə bağlayan ilk PoE++ səviyyəsidir. Switch 60 vatt göndərir, cihaz tərəfə zəmanətli təxminən 51 vatt çatır; kiçik ekranlar və güclü kameralar üçün işlədilir.",
    section: "konnektor",
    example: "Divar ekranı, kompakt PTZ kamera",
    match: ["poe++", "4ppoe"],
  },
  {
    term: "802.3bt Type 4 (PoE++)",
    label: "100 W (switch) → ~71.3 W (cihaz)",
    note: "PoE++-ın ən güclü səviyyəsidir. Switch 100 vatta qədər göndərir, kabeldəki itki ilə cihaza zəmanətli təxminən 71.3 vatt çatır; laptop monitoru və güclü Wi-Fi 6E access point kimi cihazları qidalandırmaq üçün yetərlidir.",
    section: "konnektor",
    example: "Laptop monitoru, Wi-Fi 6E access point",
    match: ["poe++", "4ppoe"],
  },
  {
    term: "DAC kabel",
    label: "Mis, passiv, qısa məsafə",
    note: "İki SFP/QSFP portunu birbaşa mis naqillə birləşdirən passiv kabeldir. Ayrıca transceiver lazım deyil, adətən 1-7 metr aralığında işlədilir və optik həlldən xeyli ucuzdur, amma məsafə məhduddur.",
    section: "konnektor",
    example: "Rack daxili switch-server bağlantısı, 1-3 m",
    match: ["direct attach copper", "twinax"],
  },
  {
    term: "AOC kabel",
    label: "Optik, aktiv, hazır uclu",
    note: "İki ucunda transceiver elektronikası hazırdan quraşdırılmış optik kabeldir. DAC-dan daha uzaq məsafəyə çatır (adətən onlarla metrə qədər), amma ayrıca lif+transceiver birləşməsindən yüngül və ucuzdur.",
    section: "konnektor",
    example: "Rack sıraları arası 10-30 m bağlantı",
    match: ["active optical cable"],
  },
  {
    term: "SFP",
    label: "1 Gbit/s transceiver",
    note: "Kiçik ölçülü dəyişdirilə bilən transceiver formatıdır, əsasən 1 Gbit/s Ethernet və fiber kanal üçün işlədilir. Yerini get-gedə SFP+ tutur.",
    section: "konnektor",
    example: "1000BASE-SX/LX portu",
    match: ["small form-factor pluggable"],
  },
  {
    term: "SFP+",
    label: "10 Gbit/s transceiver",
    note: "SFP-nin eyni fiziki ölçüdə 10 Gbit/s-ə qədər sürət verən versiyasıdır: bu gün data-mərkəzi kənar bağlantılarının ən çox rast gəlinən portudur.",
    section: "konnektor",
    example: "10GBASE-SR/LR portu, DAC kabeli",
    match: ["enhanced small form-factor pluggable"],
  },
  {
    term: "SFP28",
    label: "25 Gbit/s transceiver",
    note: "SFP+ ilə eyni ölçüdədir, amma 25 Gbit/s-ə qədər sürəti dəstəkləyir: 100 Gbit/s-i dörd SFP28 xəttinə bölən switch dizaynlarında işlədilir.",
    section: "konnektor",
    example: "25GBASE-SR portu",
    match: ["25g sfp"],
  },
  {
    term: "QSFP+",
    label: "40 Gbit/s transceiver",
    note: "Dörd SFP+ xəttini bir konnektorda birləşdirən 'quad' formatdır: 40 Gbit/s Ethernet (40GBASE-SR4) üçün MPO/MTP lif ilə işlədilir.",
    section: "konnektor",
    example: "40GBASE-SR4 portu, QSFP+ DAC",
    match: ["quad small form-factor pluggable"],
  },
  {
    term: "QSFP28",
    label: "100 Gbit/s transceiver",
    note: "QSFP+ ilə eyni ölçüdədir, dörd 25 Gbit/s xəttini birləşdirərək 100 Gbit/s verir: bu gün data-mərkəzi backbone-larının standart sürətidir.",
    section: "konnektor",
    example: "100GBASE-SR4 portu",
    match: ["100g qsfp"],
  },
];
