/**
 * Wi-Fi standards reference: what a router's spec sheet, an admin panel and a
 * chipset datasheet all call the same thing by different names, so somebody
 * staring at "802.11ax" or "-67 dBm" for the first time does not have to
 * cross-reference three websites to know what they are looking at.
 *
 * Four sections, because a visitor arrives with one of four questions.
 * "Which generation is this" goes to `nesil` — and that section carries the
 * one number every other Wi-Fi table on the internet skips. Not the
 * theoretical PHY rate alone (Wi-Fi 6 = 9.6 Gbit/s, printed everywhere,
 * reached by almost nobody's laptop), but what a real client actually
 * measures next to it: real throughput is roughly half the PHY rate at best,
 * because protocol overhead, acknowledgement frames, a half-duplex shared
 * medium and split airtime among every other device on the channel all eat
 * into it before a single byte of payload moves. "Which channel do I pick"
 * goes to `kanal`. "Is this safe" goes to `tehlukesizlik` — and the honest
 * answer for two of nine rows there is simply no. "What does this word in
 * the admin panel mean" goes to `terim`.
 */
import type { ReferenceRow, ReferenceSection } from "./reference";

export const wifiStandartlariSections: ReferenceSection[] = [
  {
    id: "nesil",
    label: "Nəsillər",
    hint: "Hər sətirdə iki rəqəm var: nəzəri PHY tavanı və adi bir cihazda ölçülən real ötürmə. Real ötürmə ən yaxşı halda PHY-nin yarısı qədərdir — protokol başlıqları, təsdiq paketləri, yarım-dupleks efir və kanalı paylaşan digər cihazlar fərqi yeyir.",
  },
  { id: "kanal", label: "Kanal və zolaq" },
  {
    id: "tehlukesizlik",
    label: "Təhlükəsizlik protokolları",
    hint: "Bura yalnız protokolun özü haqqındadır — güclü, unikal parol seçimi bundan ayrı, həmişə lazım olan bir amildir.",
  },
  { id: "terim", label: "Termin lüğəti" },
];

export const wifiStandartlariRows: ReferenceRow[] = [
  /* ---------- nesil ---------- */
  {
    term: "802.11",
    label: "1997",
    note: "İlk Wi-Fi standartıdır: yalnız 2.4 GHz-də, 2 Mbit/s-ə qədər. Bugün heç bir istehsal edilən cihaz bunu dəstəkləmir, amma bütün sonrakı nəsillərin əsasını (CSMA/CA çərçivə formatı) o qoyub.",
    section: "nesil",
    example: "PHY tavanı 2 Mbit/s idi (1 və 2 Mbit/s rejimləri) — real ötürmə rəqəmi tarixi mənbələrdə belə nadir qeyd olunub, çünki praktiki istifadəsi olmayıb.",
    match: ["ilk wifi", "orijinal 802.11", "legacy"],
  },
  {
    term: "802.11b",
    label: "1999",
    note: "2.4 GHz-də DSSS modulyasiyası ilə işləyən, ilk kütləvi yayılan Wi-Fi nəslidir. Çipləri ucuz olduğu üçün 802.11a-dan daha sürətlə bazara girdi, amma sürəti aşağı qaldı.",
    section: "nesil",
    example: "PHY tavanı 11 Mbit/s idi, real ötürmə adətən 4-6 Mbit/s arasında qalırdı.",
    match: ["dsss", "2.4ghz nesil"],
  },
  {
    term: "802.11a",
    label: "1999",
    note: "802.11b ilə eyni vaxtda çıxdı, amma 5 GHz-də OFDM modulyasiyası işlətdi. Daha sürətli idi, amma 5 GHz çipləri baha olduğu üçün 802.11b qədər yayılmadı.",
    section: "nesil",
    example: "PHY tavanı 54 Mbit/s idi, real ötürmə təxminən 20-25 Mbit/s civarında olurdu.",
    match: ["ofdm", "5ghz nesil"],
  },
  {
    term: "802.11g",
    label: "2003",
    note: "802.11a-nın OFDM sürətini 2.4 GHz-ə gətirdi və 802.11b ilə geriyə uyğun qaldı. Bu geriyə uyğunluq bir üstünlük idi, amma şəbəkədə tək bir köhnə 802.11b cihazı olanda belə bütün şəbəkəni qorumalı rejimə salıb yavaşladırırdı.",
    section: "nesil",
    example: "PHY tavanı 54 Mbit/s idi, real ötürmə 20-25 Mbit/s civarında qalırdı — 802.11a ilə eyni tavan, fərq yalnız tezlik zolağında idi.",
    match: ["ofdm 2.4ghz"],
  },
  {
    term: "Wi-Fi 4",
    label: "802.11n",
    note: "MIMO (bir neçə anten üzərindən paralel məkan axını) və 40 MHz kanal genişliyini gətirdi, ilk dəfə 5 GHz-i də dəstəklədi. 'Wi-Fi 4' adı standart çıxandan illər sonra, Wi-Fi Alliance tərəfindən marketinq üçün geriyə verilib.",
    section: "nesil",
    example: "Tək axın + 20 MHz-də PHY tavanı ~150 Mbit/s, real ötürmə ~70-90 Mbit/s idi; 4 axın + 40 MHz konfiqurasiyasında PHY 600 Mbit/s-ə çatır, amma bu konfiqurasiyanı dəstəkləyən ev cihazı az idi.",
    match: ["802.11n", "mimo nesli"],
  },
  {
    term: "Wi-Fi 5",
    label: "802.11ac",
    note: "Yalnız 5 GHz-də işləyir, 256-QAM modulyasiyası və endirilən istiqamətdə MU-MIMO (routerin bir neçə cihaza paralel yayımı) gətirdi. 2.4 GHz-i tərk etməsi köhnə cihazlarla uyğunsuzluq yaratmadı, çünki router hər iki zolağı ayrıca yayımlamağa davam edir.",
    section: "nesil",
    example: "4 axın + 80 MHz kanalla PHY tavanı ~1.73 Gbit/s-dir, real ötürmə adətən 500-700 Mbit/s civarında qalır.",
    match: ["802.11ac", "mu-mimo nesli"],
  },
  {
    term: "Wi-Fi 6",
    label: "802.11ax",
    note: "OFDMA (bir kanalı kiçik alt-daşıyıcılara bölüb bir neçə cihaza eyni anda xidmət) və hər iki istiqamətdə MU-MIMO gətirdi. Təkbaşına sürətdən çox, sıx mühitdə (ofis, stadion, mənzil binası) eyni vaxtda çox cihazla işləməyi yaxşılaşdırmaq üçün dizayn edilib.",
    section: "nesil",
    example: "PHY tavanı (8 axın, 160 MHz, 1024-QAM) 9.6 Gbit/s kimi elan olunur, amma adi 2x2 noutbuk və 80 MHz kanalla real ötürmə adətən 500-600 Mbit/s-dir — reklam rəqəmi bugünkü heç bir istehlakçı cihazının çatmadığı laboratoriya konfiqurasiyasıdır.",
    match: ["802.11ax", "ofdma nesli"],
  },
  {
    term: "Wi-Fi 6E",
    label: "802.11ax (6 GHz)",
    note: "Eyni 802.11ax standardını 6 GHz zolağına açdı, sürət rəqəmlərini dəyişmədən. Köhnə cihazlar bu zolağı tanımadığı üçün burada legacy trafik yoxdur: üstünlük sürətdə deyil, təmiz kanal sayında və interferensiyanın azlığındadır.",
    section: "nesil",
    example: "PHY rəqəmləri Wi-Fi 6 ilə eynidir; real ötürmə ədədi dəyişməsə də, sıx mühitdə tıxaclanmanın az olması sayəsində daha sabit qalır.",
    match: ["802.11ax 6ghz", "6e"],
  },
  {
    term: "Wi-Fi 7",
    label: "802.11be",
    note: "MLO (Multi-Link Operation) ilə bir cihazın eyni anda bir neçə zolaqdan (2.4, 5 və 6 GHz) paralel bağlana bilməsini gətirdi, 320 MHz kanal genişliyi və 4096-QAM əlavə etdi. Diqqət mərkəzində xam sürətdən çox gecikmə və etibarlılıqdır.",
    section: "nesil",
    example: "PHY tavanı (4096-QAM, 320 MHz, çoxsaylı axın) 46 Gbit/s kimi elan olunur, amma bu laboratoriya konfiqurasiyasıdır; ilk nəsil Wi-Fi 7 cihazlarında real ötürmə adətən 2-3 Gbit/s civarındadır.",
    match: ["802.11be", "mlo"],
  },
  {
    term: "Wi-Fi 8",
    label: "802.11bn (layihə)",
    note: "IEEE-də hələ layihə mərhələsindədir, təsdiqi bu onilliyin sonuna planlaşdırılır. Diqqət mərkəzində bu dəfə də xam sürət yox, sıx mühitdə etibarlılıq və gecikmənin sabitliyi var.",
    section: "nesil",
    example: "Standart hələ təsdiqlənməyib — bu mərhələdə hər hansı PHY və ya real sürət rəqəmi fakt deyil, ona görə bura rəqəm yazılmır; yalnız istiqamət (etibarlılıq) bəllidir.",
    match: ["802.11bn", "draft", "layihe"],
  },

  /* ---------- kanal ---------- */
  {
    term: "2.4 GHz",
    label: "13 kanal (Avropa/Azərbaycan)",
    note: "Avropa və Azərbaycanda 13 kanal ayrılıb (ABŞ-da 11-lə məhdudlaşır). Ardıcıl kanal nömrələri arasında mərkəz tezliyi fərqi cəmi 5 MHz-dir, halbuki hər kanal ötürücü siqnalla ~20-22 MHz yer tutur, ona görə qonşu kanallar bir-birinin üstünə düşür və yalnız aralarındakı fərq kanal enindən böyük olan 1, 6 və 11 tam təmizdir.",
    section: "kanal",
    example: "Router panelində kanalı 'avtomatik' yox, 1, 6 və ya 11-ə sabitləmək qonşu şəbəkələrlə üst-üstə düşməni azaldır.",
    match: ["channel 1 6 11", "2.4ghz kanallar"],
  },
  {
    term: "40 MHz (2.4 GHz)",
    note: "2.4 GHz-də cəmi üç təmiz 20 MHz kanal (1, 6, 11) olduğu üçün onlardan ikisini 40 MHz-ə birləşdirmək demək olar bütün zolağı tutur. Sıx mühitdə (mənzil binası) bu, qonşu şəbəkələrlə toqquşmanı artırır və nəticədə real sürət 20 MHz rejimindən də aşağı düşə bilər.",
    section: "kanal",
    example: "Mənzil binasında 2.4 GHz kanal enini 'avtomatik (20/40 MHz)'-dən 20 MHz-ə sabitləmək adətən daha sürətli və sabit nəticə verir.",
    match: ["channel bonding", "kanal birlesdirme"],
  },
  {
    term: "UNII-1 (5.15-5.25 GHz)",
    label: "36-48",
    note: "5 GHz-in ən aşağı alt-zolağıdır, DFS tələb etmir. Tarixən yalnız daxili istifadə üçün nəzərdə tutulub, indi bir çox tənzimləyici rejimdə açıq havada da işlədilə bilir.",
    section: "kanal",
    example: "36, 40, 44, 48 kanalları — DFS gözləmədən dərhal işə düşür.",
    match: ["unii1"],
  },
  {
    term: "UNII-2 / UNII-2A (5.25-5.35 GHz)",
    label: "52-64",
    note: "Bu alt-zolaqdakı bütün kanallar DFS (Dynamic Frequency Selection) tələb edir: access point ilk əvvəl radar üçün kanalı dinləməli, sonra da işləyərkən radar aşkarlansa kanalı tərk etməlidir.",
    section: "kanal",
    example: "52, 56, 60, 64 kanalları.",
    match: ["unii2", "unii2a"],
  },
  {
    term: "UNII-2C (5.47-5.725 GHz)",
    label: "100-144",
    note: "UNII-2-Extended də adlanır, ən çox kanal sayını daşıyan alt-zolaqdır və demək olar hamısı DFS tələb edir. 80 MHz və 160 MHz kanal genişliyi əldə etmək üçün adətən buradan istifadə olunur.",
    section: "kanal",
    example: "100, 104, 108 ... 144 kanalları — 44 kanal aralığında ən geniş seçim burdadır.",
    match: ["unii2c", "unii2-extended"],
  },
  {
    term: "UNII-3 (5.725-5.85 GHz)",
    label: "149-165",
    note: "5 GHz-in ən yuxarı alt-zolağıdır, DFS tələb etmir. Tarixən açıq havada nöqtədən-nöqtəyə körpü qurmaq üçün seçilib, bu gün ev routerlərinin əksəriyyəti də bunu dəstəkləyir.",
    section: "kanal",
    example: "149, 153, 157, 161, 165 kanalları — DFS olmadığı üçün ev router-lərinin default seçimi tez-tez buradan olur.",
    match: ["unii3"],
  },
  {
    term: "DFS",
    label: "Dynamic Frequency Selection",
    note: "5 GHz-in bir çox kanalını hava radarı və hərbi radarla paylaşdığı üçün var olan mexanizmdir. Access point kanalı işə salmadan əvvəl bir neçə dəqiqə radar üçün dinləyir (CAC), işlədiyi müddətdə radar aşkarlansa 10 saniyə ərzində kanalı tərk edib başqasına keçməlidir. Bağlantı bu keçid zamanı bir neçə saniyə kəsilə bilər.",
    section: "kanal",
    example: "'Radar aşkarlandı, kanal dəyişdirilir' logu — DFS kanalında əlaqənin naməlum səbəbdən qırıldığını görəndə axtarılacaq ilk sətir.",
    match: ["radar", "kanal deyisimi"],
  },
  {
    term: "5 GHz kanal enləri",
    label: "20/40/80/160 MHz",
    note: "Kanal genişlədikcə PHY sürəti artır, amma eyni zolaqda sığan qeyri-üst-üstə-düşən kanal sayı azalır: 160 MHz seçəndə 5 GHz-in demək olar hamısını iki kanala bölmüş olursan. Geniş kanal həm də daha çox interferensiya götürür, ona görə sıx mühitdə 80 MHz çox vaxt 160 MHz-dən daha sabit işləyir.",
    section: "kanal",
    example: "160 MHz kanal ən yüksək PHY rəqəmini verir, amma qonşu Wi-Fi şəbəkəsi olan mənzil binasında adətən 80 MHz daha etibarlı seçimdir.",
    match: ["channel width", "80mhz", "160mhz"],
  },
  {
    term: "6 GHz zolağı",
    label: "Wi-Fi 6E ilə açıldı",
    note: "Wi-Fi 6E, 802.11ax standardını əvvəllər Wi-Fi üçün istifadə olunmayan 6 GHz zolağına genişləndirdi. Bir çox ölkədə bu, yüzlərlə MHz təzə, legacy trafiksiz spektr deməkdir. 6 GHz-in mülki Wi-Fi üçün açılıb-açılmaması və hansı gücdə işlədilə biləcəyi ölkənin radiotezlik tənzimləyicisinin qərarından asılıdır və ölkədən ölkəyə fərqlənir; bu, yerli tənzimləmədən asılı olduğu üçün burada tək bir cavabla verilmir.",
    section: "kanal",
    example: "Cihaz qutusunda 'Wi-Fi 6E' yazması 6 GHz-in avtomatik işə düşəcəyi demək deyil — həm cihaz, həm də ölkənin tənzimləməsi buna icazə verməlidir.",
    match: ["6ghz", "wifi 6e kanal"],
  },

  /* ---------- tehlukesizlik ---------- */
  {
    term: "WEP",
    label: "Wired Equivalent Privacy",
    note: "Qırılıb: RC4 axın şifrəsinin zəif açar idarəetməsi (kiçik təsadüfi vektor təkrarı) sayəsində adi noutbukla bir neçə dəqiqədə sındırıla bilir. Bu gün heç bir şəraitdə istifadə edilməməlidir, hətta köhnə cihaz məcbur edəndə belə.",
    section: "tehlukesizlik",
    example: "Router panelində 'WEP' seçimi görünürsə, bu adətən yalnız 15+ illik cihazla uyğunluq üçün saxlanılıb — aktiv edilməməlidir.",
    match: ["wired equivalent privacy", "sinmis sifrelenme"],
  },
  {
    term: "WPA (TKIP)",
    label: "Wi-Fi Protected Access",
    note: "WEP-in aşkar zəifliklərini aradan qaldırmaq üçün tələsik hazırlanmış keçid protokoludur. TKIP-in özü də sonradan Beck-Tews və Ohigashi-Morii həmlələri ilə qırılmış sayılır və bu gün WEP kimi istifadə edilməməlidir.",
    section: "tehlukesizlik",
    example: "Router panelində 'WPA-TKIP' və ya 'WPA/WPA2 qarışıq' seçimləri təhlükəsizlik baxımından TKIP-i aktiv saxlayır — yalnız 'WPA2-AES' seçilməlidir.",
    match: ["tkip", "wpa1"],
  },
  {
    term: "WPA2 (CCMP/AES)",
    label: "Wi-Fi Protected Access 2",
    note: "Bu gün hələ qəbul ediləndir: AES şifrələməsi (CCMP rejimində) özü sınmayıb. Zəif tərəfi 4 tərəfli əl sıxma (handshake) zamanı tutulan trafikin offline lüğət həmləsinə açıq olmasıdır: zəif parol seçilibsə, həmlə şəbəkəyə heç toxunmadan aparıla bilər.",
    section: "tehlukesizlik",
    example: "2017-ci ildə tapılan KRACK zəifliyi məhz WPA2-nin əl sıxma prosesini hədəf alıb — protokolun AES şifrəsini yox, açar quraşdırma addımını.",
    match: ["ccmp", "aes wifi", "wpa2 personal"],
  },
  {
    term: "WPA3",
    label: "SAE (Dragonfly handshake)",
    note: "4 tərəfli əl sıxmanı SAE (Simultaneous Authentication of Equals) ilə əvəz edir. Bu, WPA2-ni zəif parolla belə lüğət həmləsinə açıq edən şeyi aradan qaldırır, çünki hücumçu bir trafik tutmasından paroları offline yoxlaya bilmir. Həmçinin forward secrecy verir: köhnə trafik sonradan parol öyrənilsə belə deşifr olunmur. Bu gün Wi-Fi təhlükəsizlik protokollarının ən güclüsüdür.",
    section: "tehlukesizlik",
    example: "Router panelində 'WPA3-Personal' seçimi — dəstəkləyən cihazlar varsa WPA2/WPA3 qarışıq rejimdən üstün tutulmalıdır.",
    match: ["sae", "dragonfly", "simultaneous authentication of equals"],
  },
  {
    term: "WPA3-Enterprise (192-bit)",
    label: "CNSA uyğun rejim",
    note: "Adi WPA3-Enterprise-ın üzərinə hökumət və maliyyə səviyyəli kriptoqrafiya tələbləri (192-bit açar gücü, GCMP-256 şifrələmə) əlavə edən rejimdir. Adi ofis şəbəkəsi üçün deyil, yüksək təhlükəsizlik tələb edən qurumlar üçün nəzərdə tutulub.",
    section: "tehlukesizlik",
    example: "Bu rejim həm access point-də, həm də RADIUS serverində eyni 192-bit dəst tələb edir — biri dəstəkləməsə bağlantı qurulmur.",
    match: ["192 bit", "cnsa", "enterprise wifi"],
  },
  {
    term: "OWE",
    label: "Enhanced Open",
    note: "Açıq (parolsuz) Wi-Fi-ı şifrələmək üçün hazırlanıb: hər qoşulan cihazla ayrıca, avtomatik açar mübadiləsi aparır. Passiv dinləməyə (eyni kafedəki başqasının trafikini oxumasına) qarşı qoruyur, amma parol tələb etmədiyi üçün saxta access point-i doğrulaya bilmir.",
    section: "tehlukesizlik",
    example: "Qonaq Wi-Fi-ı 'açıq' yerinə OWE ilə qurmaq, istifadəçidən parol istəmədən trafiki yenə də şifrələyir.",
    match: ["enhanced open", "acig wifi sifrelemesi"],
  },
  {
    term: "WPS",
    label: "Wi-Fi Protected Setup",
    note: "PIN rejimi 8 rəqəmli kodu iki ayrı yarı kimi təsdiqləyir, bu da mümkün kombinasiyanı praktiki olaraq ~11.000-ə endirir və brute-force həmləsini bir neçə saata qədər qısaldır (Pixie Dust həmləsi bəzi çiplərdə bunu dəqiqələrə endirir). Router panelində söndürülməlidir.",
    section: "tehlukesizlik",
    example: "Router üzərindəki fiziki 'WPS' düyməsi işə düşürsə, panel ayarlarından PIN rejimi ayrıca söndürülməlidir — düymə fiziki basılmadan da PIN aktiv qala bilir.",
    match: ["wps pin", "pixie dust"],
  },
  {
    term: "KRACK",
    label: "2017",
    note: "WPA2-nin 4 tərəfli əl sıxmasına qarşı tapılan açar-yenidənquraşdırma (key reinstallation) həmləsidir: protokolun şifrəsini yox, açarın necə quraşdırıldığını hədəf alır. İstehsalçıların proqram təminatı yeniləmələri ilə düzəldilib, protokolun özündə (802.11-2016 düzəlişi) də bağlanıb.",
    section: "tehlukesizlik",
    example: "2017-ci ildə açıqlandı; düzəliş tərəf (client) tərəfindən tələb olunur — köhnəlmiş, yenilənməmiş cihaz hələ də açıq qala bilər.",
    match: ["key reinstallation attack", "wpa2 zeiflik"],
  },
  {
    term: "Dragonblood",
    label: "2019",
    note: "Erkən WPA3 tətbiqlərinin SAE əl sıxmasına qarşı tapılan həmlələr toplusudur (zaman və keş əsaslı yan-kanal sızmaları, aşağı-versiyaya endirmə həmlələri). Wi-Fi Alliance-ın SAE tətbiqini sərtləşdirən düzəlişləri ilə bağlanıb. Bugünkü WPA3 sertifikatlı cihazlar bu düzəlişləri daşıyır.",
    section: "tehlukesizlik",
    example: "2019-cu ildə açıqlandı; nəticədə WPA3 sertifikasiya tələbləri sərtləşdirildi, protokolun özü (SAE) tərk edilmədi.",
    match: ["wpa3 zeiflik", "side channel wifi"],
  },

  /* ---------- terim ---------- */
  {
    term: "MIMO",
    label: "Multiple Input, Multiple Output",
    note: "Router və cihazın bir neçə anten üzərindən eyni anda bir neçə məlumat axını göndərib qəbul etməsidir: tək anten dövründəki bir-birinin ardınca ötürməni paralelə çevirir.",
    section: "terim",
    match: ["coxlu anten"],
  },
  {
    term: "MU-MIMO",
    label: "Multi-User MIMO",
    note: "Routerin MIMO antenlərini bir cihaza deyil, bir neçə cihaza eyni zaman diliminə paylayaraq işlətməsidir: SU-MIMO-da router növbə ilə bir cihaba, MU-MIMO-da isə paralel bir neçə cihaba xidmət edir.",
    section: "terim",
    match: ["multi user mimo", "su-mimo"],
  },
  {
    term: "OFDMA",
    label: "Orthogonal Frequency-Division Multiple Access",
    note: "Wi-Fi 6-nın gətirdiyi bölgüdür: bir kanalı kiçik alt-daşıyıcı qruplarına (resource unit) bölüb, hər qrupu ayrı cihaza ayırır. MU-MIMO fəza üzrə paylaşırsa, OFDMA tezlik üzrə paylaşır və kiçik, tez-tez göndərilən paketlərdə (IoT, VoIP) daha səmərəlidir.",
    section: "terim",
    match: ["resource unit", "tezlik bolgusu"],
  },
  {
    term: "Beamforming",
    label: "Şüa formalaşdırma",
    note: "Router siqnal enerjisini bütün istiqamətlərə bərabər yaymaq əvəzinə, konkret bir cihaza tərəf fokuslayır. Bu, həmin cihazda siqnal-küy nisbətini yaxşılaşdırır, ötürmə məsafəsini deyil, siqnalın keyfiyyətini artırır.",
    section: "terim",
    match: ["signal steering"],
  },
  {
    term: "Məkan axınları",
    label: "Spatial streams",
    note: "MIMO vasitəsilə eyni anda göndərilən müstəqil məlumat axınlarının sayıdır: '2x2' iki axın deməkdir. Hər əlavə axın hər iki tərəfdə (router və cihazda) əlavə anten tələb edir, ona görə telefonun axın sayı adətən routerinkindən azdır.",
    section: "terim",
    match: ["spatial streams", "2x2 3x3 4x4"],
  },
  {
    term: "Band steering",
    label: "Zolaq yönləndirmə",
    note: "Router hər iki zolağı dəstəkləyən cihazı daha az izdihamlı 5 GHz-ə yönləndirmək üçün 2.4 GHz probe sorğularına gec cavab verir və ya cavab vermir. Cihaz nəticədə özü 5 GHz-i seçmiş kimi görünür.",
    section: "terim",
    match: ["band steering", "zolaq secimi"],
  },
  {
    term: "Roaming",
    label: "802.11k/v/r",
    note: "Bir router şəbəkəsində cihazın access point dəyişəndə bağlantını itirməməsini asanlaşdıran üç əlavədir: 802.11k qonşu access point siyahısını verir, 802.11v şəbəkəyə cihaza 'indi keçmək daha yaxşıdır' deməyə imkan verir, 802.11r isə eyni şəbəkə daxilində keçiddə tam yenidən doğrulama addımını qısaldır.",
    section: "terim",
    match: ["802.11k", "802.11v", "802.11r", "fast bss transition"],
  },
  {
    term: "TWT",
    label: "Target Wake Time",
    note: "Wi-Fi 6 ilə gələn, cihazın router ilə əlaqəni nə vaxt yoxlayacağını əvvəlcədən razılaşdırmasına imkan verən mexanizmdir: cihaz aralarda radiosunu söndürə bilir, bu da xüsusilə IoT sensor və telefon batareyasına kömək edir.",
    section: "terim",
    match: ["target wake time", "batareya wifi"],
  },
  {
    term: "BSS colouring",
    label: "BSS rəngləmə",
    note: "Wi-Fi 6 ilə gələn, hər ötürməyə şəbəkəni tanıdan kiçik bir 'rəng' rəqəmi əlavə edən mexanizmdir: cihaz eşitdiyi siqnalın öz şəbəkəsindəndirmi, yoxsa üst-üstə düşən qonşu şəbəkədəndirmi olduğunu bu rənglə ayırd edir və lazımsız gözləməni azaldır.",
    section: "terim",
    match: ["bss coloring", "spatial reuse"],
  },
  {
    term: "RSSI",
    label: "Sinyal gücü (dBm)",
    note: "Qəbul edilən sinyalın gücüdür, mənfi ədədlə ölçülür və sıfıra nə qədər yaxındırsa, siqnal bir o qədər güclüdür: -50 dBm əla, -67 dBm səs zəngi (VoIP) üçün adətən qəbul edilən minimal hədd, -80 dBm isə demək olar istifadəyə yaramaz sayılır.",
    section: "terim",
    example: "-45 dBm — çox güclü, otaqda routerin yanında; -72 dBm — divarların arxasında, video zəngdə kəsilmə gözlənilə bilər.",
    match: ["dbm", "sinyal gucu"],
  },
  {
    term: "SNR",
    label: "Signal-to-Noise Ratio",
    note: "Siqnal gücü ilə fon küyü arasındakı fərqdir, dB ilə ölçülür. Güclü RSSI görünsə belə, fon küyü də yüksəkdirsə (mikrodalğalı soba, qonşu şəbəkələr) aşağı SNR yenidən ötürmələrə səbəb olur. RSSI təkbaşına keyfiyyəti göstərmir.",
    section: "terim",
    match: ["kuy nisbeti", "signal noise ratio"],
  },
  {
    term: "Airtime fairness",
    label: "Efir vaxtı ədaləti",
    note: "Wi-Fi paylaşılan, yarım-dupleks bir mühitdir: eyni anda yalnız bir cihaz danışa bilir. Bu mexanizm yavaş, köhnə bir cihazın kanalı uzun tutub sürətli cihazları gecikdirməsinin qarşısını alır, hər cihaza vaxt payını ədalətli bölərək.",
    section: "terim",
    match: ["shared medium", "half duplex"],
  },
  {
    term: "Mesh və repeater",
    label: "Fərq",
    note: "Repeater (təkrarlayıcı) sadəcə gələn siqnalı tutub yenidən yayımlayır. Hər sıçrayışda ötürmə tez-tez yarıya enir və ayrı SSID yaradır. Mesh node-ları isə bir-biri və mərkəzi controller ilə danışaraq tək SSID altında ağıllı marşrutlaşdırma aparır, cihazı ən yaxşı node-a avtomatik keçirir.",
    section: "terim",
    match: ["wifi extender", "mesh network"],
  },
  {
    term: "Kanal və tezlik",
    label: "Fərq",
    note: "Tezlik fiziki bir nöqtədir (məsələn 2437 MHz). Kanal isə standartın həmin tezlik ətrafındakı nömrələnmiş dilimidir (kanal 6 = 2437 MHz mərkəzli, 20 MHz enində). Router panelində 'kanal 6' seçmək, əslində 2437 MHz mərkəzli bir tezlik zolağı seçməkdir.",
    section: "terim",
    match: ["frequency vs channel", "tezlik kanal ferqi"],
  },
];
