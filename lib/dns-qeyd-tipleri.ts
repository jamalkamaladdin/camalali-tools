/**
 * DNS record types: every type name a visitor meets in a zone file, a `dig`
 * output or a provider's DNS panel, what it holds, what it is for, and the
 * trap that comes with it.
 *
 * `label` carries the numeric type code from the IANA "Resource Record (RR)
 * TYPEs" registry rather than a short name, because the code is the fact a
 * spec or a packet capture actually shows — `CNAME` and `5` are the same
 * question asked from either side, exactly like `dns.ts`'s own record types
 * do for the eight it resolves live.
 *
 * The grouping fixes the most common confusion this table exists to answer:
 * SPF, DKIM, DMARC, BIMI, MTA-STS and TLSRPT are not DNS types of their own —
 * every one of them is a convention written into an ordinary `TXT` record,
 * and IANA's own attempt to give SPF a dedicated type (99) was retired by
 * RFC 7208. So the mail section holds the conventions and the deprecated
 * section holds the retired type — `SPF` appears as a `term` in both, on
 * purpose, because that contrast is the answer. The query-and-control
 * section is kept apart from every other section for the same reason
 * `AXFR`/`IXFR`/`ANY`/`OPT`/`TSIG` confuse people: none of them is ever
 * written into a zone file. They are message types a resolver or a server
 * sends, not records a domain owner stores — each row says so.
 */
import type { ReferenceRow, ReferenceSection } from "./reference";

export const dnsQeydTipleriSections: ReferenceSection[] = [
  { id: "esas", label: "Əsas" },
  {
    id: "poct",
    label: "Poçt",
    hint: "SPF, DKIM, DMARC, BIMI, MTA-STS və TLSRPT — heç birinin öz DNS tipi yoxdur, hamısı TXT qeydinin üstündə qurulub.",
  },
  { id: "xidmet-kesf", label: "Xidmət və kəşf" },
  { id: "tehlukesizlik", label: "Təhlükəsizlik" },
  {
    id: "sorgu-nezaret",
    label: "Sorğu və nəzarət",
    hint: "Bunlar zonada saxlanan qeydlər deyil — resolver və server arasında gedən sorğu tipləridir.",
  },
  {
    id: "kohne",
    label: "Köhnə və istifadədən çıxmış",
    hint: "Rəsmi reyestrdə hələ görünür, amma bugünkü DNS-də bunları heç bir server yazmır.",
  },
];

export const dnsQeydTipleriRows: ReferenceRow[] = [
  /* ---------- esas ---------- */
  {
    term: "A",
    label: "1",
    note: "Domeni IPv4 ünvanına bağlayır — brauzer səhifəni bu ünvandan istəyir. Ən köhnə və ən çox axtarılan qeyd tipidir.",
    section: "esas",
    example: "example.com. 3600 IN A 93.184.216.34",
    match: ["address record", "ipv4"],
  },
  {
    term: "AAAA",
    label: "28",
    note: "Domeni IPv6 ünvanına bağlayır. A qeydi olmadan da işləyə bilər — ikisi eyni adda paralel yaşayır, brauzer əvvəlcə AAAA-nı sınayır.",
    section: "esas",
    example: "example.com. 3600 IN AAAA 2606:2800:220:1:248:1893:25c8:1946",
    match: ["quad-a", "ipv6 address"],
  },
  {
    term: "CNAME",
    label: "5",
    note: "Adı IP-yə yox, başqa bir ada yönləndirir. Kök domendə (apex, məs. `example.com`) qoyula bilməz və eyni adda başqa heç bir qeydlə yan-yana ola bilməz — bu iki qadağa ALIAS, ANAME kimi provayder-spesifik 'apex flattening' funksiyalarının yaranma səbəbidir; onlar DNS tipi deyil, vendor xüsusiyyətidir.",
    section: "esas",
    example: "www.example.com. 3600 IN CNAME example.com.",
    match: ["canonical name", "alias record", "apex flattening"],
  },
  {
    term: "MX",
    label: "15",
    note: "Domenə gələn poçtu hansı server qəbul edəcəyini göstərir; ədəd nə qədər kiçikdirsə, o server bir o qədər əvvəl sınanır. Tək nöqtə (`.`) hədəfi RFC 7505-ə görə 'bu domen heç poçt qəbul etmir' deməkdir.",
    section: "esas",
    example: "example.com. 3600 IN MX 10 mail.example.com.",
    match: ["mail exchange", "mail server record", "null mx"],
  },
  {
    term: "TXT",
    label: "16",
    note: "İstənilən sərbəst mətni saxlayan universal qeyddir; SPF, DKIM, DMARC və sahiblik təsdiqləri hamısı bunun üzərində qurulub. Bir sətir (string) 255 baytla məhdudlaşır — daha uzun məzmun (məsələn DKIM açarı) bir neçə dırnaqlı sətrə bölünür və oxuyan tərəf onları özü birləşdirir.",
    section: "esas",
    example: 'example.com. 3600 IN TXT "google-site-verification=abc123"',
    match: ["text record", "255 byte limit"],
  },
  {
    term: "NS",
    label: "2",
    note: "Domenin zonasına hansı ad serverlərinin cavabdeh olduğunu bildirir; registrar səviyyəsindəki 'glue' qeydlərlə üst-üstə düşməlidir, yoxsa domen lame delegation vəziyyətinə düşür.",
    section: "esas",
    example: "example.com. 86400 IN NS ns1.example-dns.com.",
    match: ["name server record", "delegation"],
  },
  {
    term: "SOA",
    label: "6",
    note: "Zonanın başlanğıc qeydidir: əsas ad server, admin e-poçtu, seriya nömrəsi və təkrar sinxronizasiya vaxtları. Seriya nömrəsini artırmadan zona faylını dəyişmək bəzi ikincil serverlərin yeniləməni görməməsinə səbəb olur.",
    section: "esas",
    example: "example.com. 86400 IN SOA ns1.example.com. admin.example.com. 2026090301 7200 3600 1209600 3600",
    match: ["start of authority", "zone serial"],
  },
  {
    term: "PTR",
    label: "12",
    note: "IP ünvanını ada bağlayan tərs qeyddir, `in-addr.arpa` (IPv4) və ya `ip6.arpa` (IPv6) zonasında yaşayır. Bu zonaya domen sahibi yox, IP blokunun sahibi (adətən hosting və ya ISP) yazır — ona görə öz domeninin PTR-ını özün deyil, provayderindən istəyərək düzəldirsən.",
    section: "esas",
    example: "34.216.184.93.in-addr.arpa. 3600 IN PTR example.com.",
    match: ["reverse dns", "rdns", "in-addr.arpa"],
  },
  {
    term: "TTL",
    label: "Saniyə",
    note: "Bu, DNS qeyd tipi deyil — hər qeydin yanında duran, cavabın resolver keşində neçə saniyə saxlanacağını göstərən ədəddir. Planlaşdırılan dəyişiklikdən əvvəl azaldılması yayılma müddətini qısaldır.",
    section: "esas",
    example: "example.com. 300 IN A 93.184.216.34   ← 300 buradakı TTL-dir",
    match: ["time to live", "cache duration", "propagation"],
  },

  /* ---------- poct ---------- */
  {
    term: "SPF",
    label: "TXT",
    note: "Ayrıca qeyd tipi deyil — göndərməyə icazəli serverlər `v=spf1` prefiksli TXT qeydində saxlanılır. 2005-də ayrıca tip (99) təklif olunmuşdu, RFC 7208 bunu 2014-də rəsmən ləğv etdi.",
    section: "poct",
    example: 'example.com. 3600 IN TXT "v=spf1 include:_spf.google.com ~all"',
    match: ["spf", "sender policy framework", "v=spf1"],
  },
  {
    term: "DKIM",
    label: "TXT (selector._domainkey)",
    note: "Göndərilən məktubu rəqəmsal imzalayan açıq açar TXT qeydində saxlanılır, adı `<seçici>._domainkey.<domen>` formatındadır. Açar mətni tez-tez 255 baytdan uzun olur — o zaman bir neçə dırnaqlı sətrə bölünür, sistemlər həmin sətirləri sadəcə ardıcıl birləşdirərək oxuyur.",
    section: "poct",
    example: 'selector1._domainkey.example.com. TXT "v=DKIM1; k=rsa; p=MIGfMA0GCSq..."',
    match: ["domainkeys identified mail", "dkim selector"],
  },
  {
    term: "DMARC",
    label: "TXT (_dmarc)",
    note: "SPF və DKIM uyğunsuzluğunda alıcı serverin nə etməli olduğunu (heç nə, karantin, rədd) təyin edən siyasətdir, `_dmarc.<domen>` altında TXT kimi yazılır. `p=none` siyasəti heç nəyi bloklamır, yalnız hesabat toplayır.",
    section: "poct",
    example: '_dmarc.example.com. TXT "v=DMARC1; p=quarantine; rua=mailto:reports@example.com"',
    match: ["domain-based message authentication", "dmarc policy"],
  },
  {
    term: "BIMI",
    label: "TXT (default._bimi)",
    note: "Poçt qutusunda brend loqosunu göstərmək üçün istifadə olunur, amma yalnız DMARC siyasəti `quarantine` və ya `reject` səviyyəsindədirsə işə düşür. Qeyd loqo SVG-sinə, bəzən 'Verified Mark Certificate' sənədinə keçid daşıyır.",
    section: "poct",
    example: 'default._bimi.example.com. TXT "v=BIMI1; l=https://example.com/logo.svg"',
    match: ["brand indicators for message identification", "email logo"],
  },
  {
    term: "MTA-STS",
    label: "TXT (_mta-sts) + siyasət faylı",
    note: "Poçtun yalnız TLS ilə çatdırılmasını tələb edən mexanizmdir; TXT qeydi sadəcə siyasətin versiyasını göstərir, əsl qaydalar `https://mta-sts.<domen>/.well-known/mta-sts.txt` ünvanındakı ayrıca faylda yaşayır.",
    section: "poct",
    example: '_mta-sts.example.com. TXT "v=STSv1; id=20260301000000Z"',
    match: ["mail transport security", "sts policy"],
  },
  {
    term: "TLSRPT",
    label: "TXT (_smtp._tls)",
    note: "MTA-STS və ya DANE ilə TLS bağlantısı uğursuz olanda hesabatın hara göndəriləcəyini bildirir; özü heç bir qaydanı tətbiq etmir, yalnız uğursuzluqları izləyir.",
    section: "poct",
    example: '_smtp._tls.example.com. TXT "v=TLSRPTv1; rua=mailto:tls-reports@example.com"',
    match: ["tls reporting", "smtp tls report"],
  },

  /* ---------- xidmet-kesf ---------- */
  {
    term: "SRV",
    label: "33",
    note: "Bir xidmətin hansı host və portda dayandığını göstərir, adı `_xidmet._protokol.domen` formatındadır (məsələn `_sip._tcp`). SIP, XMPP və oyun serveri kəşfi bundan istifadə edir.",
    section: "xidmet-kesf",
    example: "_sip._tcp.example.com. 3600 IN SRV 10 60 5060 sipserver.example.com.",
    match: ["service record", "service discovery"],
  },
  {
    term: "SVCB",
    label: "64",
    note: "Siyahıdakı ən yeni tipdir — bir xidmətin dəstəklədiyi protokolları (h2, h3), portunu və IP ipuçlarını əlaqə qurulmazdan əvvəl elan etməyə imkan verir. HTTPS qeydi onun veb üçün xüsusiləşmiş versiyasıdır.",
    section: "xidmet-kesf",
    example: "example.com. 3600 IN SVCB 1 . alpn=h3,h2",
    match: ["service binding", "http3 discovery"],
  },
  {
    term: "HTTPS",
    label: "65",
    note: "SVCB-nin veb üçün xüsusiləşmiş formasıdır; brauzerə HTTP/3-ə birbaşa keçməyi və Encrypted Client Hello (ECH) açarını əvvəlcədən bildirir — bu, TLS əl sıxışmasında domen adının açıq görünməsinin qarşısını alır.",
    section: "xidmet-kesf",
    example: "example.com. 3600 IN HTTPS 1 . alpn=h3,h2 ech=AEn+...",
    match: ["encrypted client hello", "ech", "http3"],
  },
  {
    term: "NAPTR",
    label: "35",
    note: "Bir nömrəni və ya adı addım-addım başqa bir sorğuya (çox vaxt SRV-yə) çevirən qaydalar zənciridir; ENUM telefon nömrəsi marşrutlaması və SIP kəşfi klassik istifadə sahəsidir.",
    section: "xidmet-kesf",
    example: 'example.com. 3600 IN NAPTR 100 10 "S" "SIP+D2U" "" _sip._udp.example.com.',
    match: ["naming authority pointer", "enum"],
  },
  {
    term: "URI",
    label: "256",
    note: "SRV-nin sadələşdirilmiş formasıdır — port və çəki əvəzinə birbaşa tam URI göstərir; RFC 7553-də təsvir olunub, amma real dünyada SRV qədər geniş dəstəklənmir.",
    section: "xidmet-kesf",
    example: '_ftp._tcp.example.com. 3600 IN URI 10 1 "ftp://ftp.example.com/"',
    match: ["uniform resource identifier record"],
  },

  /* ---------- tehlukesizlik ---------- */
  {
    term: "CAA",
    label: "257",
    note: "Bu domenə hansı sertifikat mərkəzlərinin (CA) TLS sertifikatı verə biləcəyini məhdudlaşdırır. Yalnız sertifikat verilən anda sertifikat mərkəzi tərəfindən yoxlanılır — brauzer səhifəni açanda buna baxmır, ona görə səhv CAA saytı sındırmaz, sadəcə yeni sertifikat almağı əngəlləyər.",
    section: "tehlukesizlik",
    example: 'example.com. 3600 IN CAA 0 issue "letsencrypt.org"',
    match: ["certificate authority authorization"],
  },
  {
    term: "TLSA",
    label: "52",
    note: "DANE mexanizminin əsasıdır — hansı sertifikatın və ya açarın bu xidmət üçün etibarlı olduğunu birbaşa DNS-də elan edir, CA-ya güvənməyi əvəzləyir. Yalnız DNSSEC imzalanmış zonada mənalıdır, yoxsa qeydin özü saxtalaşdırıla bilər.",
    section: "tehlukesizlik",
    example: "_443._tcp.example.com. 3600 IN TLSA 3 1 1 abc123def456...",
    match: ["dane", "tls authentication"],
  },
  {
    term: "SSHFP",
    label: "44",
    note: "SSH server açarının barmaq izini DNS-də saxlayır ki, ilk qoşulmada `ssh` `known_hosts` xəbərdarlığını DNSSEC vasitəsilə avtomatik yoxlaya bilsin.",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN SSHFP 4 2 123456789abcdef...",
    match: ["ssh fingerprint", "known_hosts"],
  },
  {
    term: "DS",
    label: "43",
    note: "Alt zonanın DNSKEY-inin heşini yuxarı zonada saxlayır — DNSSEC etibar zəncirini bir səviyyə yuxarı bağlayan qeyddir; registrar panelində 'DS record' yükləmək domeni imzalı zonaya bağlayır.",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN DS 12345 8 2 ABCDEF0123456789...",
    match: ["delegation signer", "trust chain"],
  },
  {
    term: "DNSKEY",
    label: "48",
    note: "Zonanın DNSSEC açıq açarını daşıyır — RRSIG imzalarını yoxlamaq üçün istifadə olunur. Adətən iki cüt olur: tez-tez dəyişən ZSK (zone signing key) və nadir dəyişən KSK (key signing key).",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN DNSKEY 257 3 8 AwEAAagAI...",
    match: ["dnssec public key", "zsk", "ksk"],
  },
  {
    term: "RRSIG",
    label: "46",
    note: "Başqa bir qeyd dəstinin (RRset) rəqəmsal imzasıdır — DNSSEC-də hər cavab öz RRSIG-i ilə birlikdə gəlir, resolver bunu DNSKEY ilə yoxlayır.",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN RRSIG A 8 2 3600 20260401000000 20260301000000 12345 example.com. ABCDEF...",
    match: ["resource record signature"],
  },
  {
    term: "NSEC",
    label: "47",
    note: "Bir adın mövcud olmadığını sübut etmək üçün DNSSEC-in istifadə etdiyi qeyddir — zonadakı növbəti mövcud ada işarə edir. Yan təsiri: zonanın bütün adlarını ardıcıl sorğu ilə gəzib çıxarmaq (zone walking) mümkün olur.",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN NSEC mail.example.com. A MX RRSIG NSEC",
    match: ["next secure record", "zone walking", "denial of existence"],
  },
  {
    term: "NSEC3",
    label: "50",
    note: "NSEC-in eyni işi görən, amma adları açıq yazmaq əvəzinə heşləyən versiyasıdır — zona gəzintisini çətinləşdirir, tamamilə bağlamır.",
    section: "tehlukesizlik",
    example: "37h9fkm8...example.com. 3600 IN NSEC3 1 0 10 ABCD 92h3k...  A RRSIG",
    match: ["hashed denial of existence"],
  },
  {
    term: "CDS",
    label: "59",
    note: "Alt zonanın öz DS qeydinin necə olmasını istədiyini yuxarı zonaya ('parent') bildirir — bəzi registrar-lar bunu avtomatik oxuyub DS-i özləri yeniləyir (CDS/CDNSKEY consumer).",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN CDS 12345 8 2 ABCDEF0123456789...",
    match: ["child ds", "automated dnssec rollover"],
  },
  {
    term: "CDNSKEY",
    label: "60",
    note: "CDS ilə eyni məqsədi DNSKEY formatında görür — alt zona öz açarını yuxarı zonaya köçürmək istədiyini elan edir, avtomatik açar dəyişimi (key rollover) üçün nəzərdə tutulub.",
    section: "tehlukesizlik",
    example: "example.com. 3600 IN CDNSKEY 257 3 8 AwEAAagAI...",
    match: ["child dnskey", "key rollover"],
  },

  /* ---------- sorgu-nezaret ---------- */
  {
    term: "AXFR",
    label: "252",
    note: "Zonada saxlanan qeyd deyil — bütün zonanı bir dəfəyə köçürən sorğu tipidir, əsas server ikincil serverə tam surət verəndə işlədilir. Kənara açıq buraxılan AXFR zonanın bütün adlarını sızdıra bilər.",
    section: "sorgu-nezaret",
    example: "dig axfr example.com @ns1.example.com",
    match: ["full zone transfer", "query type"],
  },
  {
    term: "IXFR",
    label: "251",
    note: "AXFR kimi qeyd deyil, sorğu tipidir — amma bütün zonanı yox, son sinxronizasiyadan bəri dəyişən hissəni köçürür, SOA seriya nömrəsi bunun üçün müqayisə nöqtəsidir.",
    section: "sorgu-nezaret",
    example: "dig ixfr=2026090301 example.com @ns1.example.com",
    match: ["incremental zone transfer", "query type"],
  },
  {
    term: "ANY",
    label: "255 (*)",
    note: "Zonada saxlanan qeyd deyil, 'bu adda nə varsa hamısını göstər' sorğusudur. Kiçik sorğuya nisbətən çox böyük cavab qaytardığı üçün DNS gücləndirmə (amplification) hücumlarında sui-istifadə olunub — bir çox resolver artıq tam dəstəkləmir.",
    section: "sorgu-nezaret",
    example: "dig ANY example.com",
    match: ["query type", "dns amplification"],
  },
  {
    term: "OPT",
    label: "41",
    note: "Zonada yazılmır — hər sorğu və cavaba əlavə olunan psevdo-qeyddir, EDNS0 uzantısının daşıyıcısıdır; DNSSEC üçün lazım olan 512 baytdan böyük UDP cavablarını mümkün edir.",
    section: "sorgu-nezaret",
    example: "; EDNS: version: 0, flags:; udp: 4096",
    match: ["edns0", "pseudo record", "extension mechanism for dns"],
  },
  {
    term: "TSIG",
    label: "250",
    note: "Zonada saxlanmır — iki server arasındakı sorğu-cavabı (adətən zona köçürməsini) paylaşılan sirlə imzalayan sorğu-səviyyəli mexanizmdir; DNSSEC-dən fərqli olaraq asimmetrik açar yox, ortaq açar işlədir.",
    section: "sorgu-nezaret",
    example: "dig axfr example.com @ns1.example.com -y hmac-sha256:keyname:base64secret",
    match: ["transaction signature", "shared secret"],
  },

  /* ---------- kohne ---------- */
  {
    term: "SPF",
    label: "99 (ləğv edilib)",
    note: "IANA reyestrində ayrıca SPF tipi 2005-də ayrılmışdı, amma heç vaxt geniş dəstək tapmadı; RFC 7208 onu rəsmən ləğv etdi — bugün SPF yalnız TXT qeydi kimi yazılır.",
    section: "kohne",
    example: "; type 99 (SPF) artıq heç bir aktual DNS proqramı tərəfindən yazılmır",
    match: ["spf type 99", "spf record type", "retired"],
  },
  {
    term: "MD",
    label: "3 (ləğv edilib)",
    note: "Poçtu qəbul edən serveri göstərmək üçün nəzərdə tutulmuşdu, amma MX gələndən dərhal sonra rəsmi olaraq istifadədən çıxarıldı (RFC 973, 1035). Bu gün heç bir server onu yazmır.",
    section: "kohne",
    match: ["mail destination", "obsolete"],
  },
  {
    term: "MF",
    label: "4 (ləğv edilib)",
    note: "MD-nin cütü idi — poçtu ötürən ('forward') serveri göstərirdi; ikisi də MX-in xeyrinə 1980-ci illərdə tərk edildi.",
    section: "kohne",
    match: ["mail forwarder", "obsolete"],
  },
  {
    term: "WKS",
    label: "11 (ləğv edilib)",
    note: "Bir hostda hansı 'well-known' portların açıq olduğunu DNS-də elan etmək üçün yazılmışdı; port siyahısını DNS-də saxlamaq təhlükəsizlik baxımından səhv fikir sayıldı və tərk edildi.",
    section: "kohne",
    match: ["well known services", "deprecated"],
  },
  {
    term: "A6",
    label: "38 (ləğv edilib)",
    note: "IPv6 ünvanını hissə-hissə, zəncirlənən qeydlərlə saxlamaq üçün AAAA-ya alternativ kimi təklif olunmuşdu; mürəkkəbliyi xeyrini üstələdi, RFC 6563 onu rəsmən 'tarixi' elan edib — bugün hər yerdə sadə AAAA işlədilir.",
    section: "kohne",
    match: ["ipv6 chained address", "historic"],
  },
  {
    term: "MB",
    label: "7 (eksperimental)",
    note: "Poçt qutusunun yerləşdiyi hostu göstərmək üçün eksperimental tip kimi təyin edilmişdi, heç vaxt geniş yayılmadı və istifadə olunmur.",
    section: "kohne",
    match: ["mailbox record", "experimental"],
  },
  {
    term: "MG",
    label: "8 (eksperimental)",
    note: "Poçt qrupunun üzvünü göstərən eksperimental tip idi — poçt siyahısı idarəçiliyi sonradan tamamilə SMTP tərəfinin işi oldu, bu tip tərk edildi.",
    section: "kohne",
    match: ["mail group member", "experimental"],
  },
  {
    term: "MR",
    label: "9 (eksperimental)",
    note: "Poçt qutusunun yeni adını göstərən 'yönləndirmə' qeydi kimi eksperimental təklif olunmuşdu; MB və MG kimi heç vaxt istehsala çıxmadı.",
    section: "kohne",
    match: ["mail rename", "experimental"],
  },
  {
    term: "NULL",
    label: "10 (eksperimental)",
    note: "Formatı təyin olunmamış, ixtiyari ikili məlumat daşımaq üçün ayrılmış eksperimental tipdir — DNS protokolunun daxili sınaqlarından kənar heç vaxt real istifadə tapmadı.",
    section: "kohne",
    match: ["experimental record", "opaque data"],
  },
  {
    term: "HINFO",
    label: "13",
    note: "Hostun prosessor və əməliyyat sistemi tipini elan etmək üçün yazılmışdı (məs. `INTEL-386 LINUX`); bu məlumatı açıq DNS-də göstərmək təhlükəsizlik baxımından məntiqsiz sayıldığı üçün praktikada tərk edilib, formal olaraq isə hələ ləğv edilməyib.",
    section: "kohne",
    example: 'example.com. 3600 IN HINFO "INTEL-386" "LINUX"',
    match: ["host information", "cpu os record"],
  },
  {
    term: "X25",
    label: "19",
    note: "X.25 şəbəkəsindəki PSDN ünvanını saxlamaq üçün yazılmışdı; X.25 texnologiyasının özü artıq tarixdir, ona görə bu tip yalnız köhnə RFC-lərdə qalır.",
    section: "kohne",
    match: ["x.25 address", "psdn"],
  },
  {
    term: "ISDN",
    label: "20",
    note: "ISDN telefon nömrəsini domenə bağlamaq üçün yazılmışdı; ISDN xətlərinin özü istehsaldan çıxdığı üçün bu qeyd də istifadə olunmur.",
    section: "kohne",
    match: ["isdn address record"],
  },
  {
    term: "RT",
    label: "21",
    note: "Poçtdan fərqli, ümumi 'marşrutlaşdırma vasitəçisi' hostunu göstərmək üçün MX-in qohumu kimi yazılmışdı; heç vaxt geniş tətbiq tapmadı.",
    section: "kohne",
    match: ["route through record"],
  },
  {
    term: "SIG",
    label: "24 (RRSIG ilə əvəz olunub)",
    note: "DNSSEC-in ilk versiyasının imza qeydi idi; 2005-də protokol yenidən yazılanda RRSIG onu əvəz etdi, SIG bugün yalnız TKEY/TSIG kontekstində (SIG(0)) nadir hallarda görünür.",
    section: "kohne",
    match: ["signature record", "sig0"],
  },
  {
    term: "KEY",
    label: "25 (DNSKEY ilə əvəz olunub)",
    note: "SIG kimi DNSSEC-in ilk versiyasına aiddir — açıq açarı daşıyırdı; 2005-ci il yenidən yazımında DNSKEY onu əvəz etdi, bugün yalnız SIG(0) əməliyyatlarında qalıq kimi görünür.",
    section: "kohne",
    match: ["dnssec key record v1"],
  },
];
