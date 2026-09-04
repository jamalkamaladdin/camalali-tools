/*
 * A character inspector and an ASCII/Unicode lookup table.
 *
 * The tool exists because of one recurring bug report that never names itself:
 * "the text looks right but the code says it is different". The cause is
 * almost always a character nobody can see — a non-breaking space pasted out
 * of Word, a zero-width joiner inside an emoji, a BOM at the head of a JSON
 * file, a soft hyphen a CMS inserted. None of them show up on screen, all of
 * them break comparison, and no amount of staring at the string finds them.
 *
 * So the inspector prints one row per code point and refuses to leave an empty
 * cell: a character that draws no ink still gets a dot and a name. The
 * reference half is the lookup somebody wants a minute later — what is the
 * code point, what are the UTF-8 bytes, which entity do I write in HTML.
 *
 * React-free on purpose: `scripts/tools-checks/ascii-unicode.mts` imports this
 * file directly, and the reference rows are audited by the same
 * `auditReference` every other lookup table in the site runs.
 */
import type { ReferenceRow, ReferenceSection } from "./reference";

export type CharInfo = {
  char: string;
  /** What the table draws. A dot stands in for anything that has no ink. */
  display: string;
  codePoint: number;
  /** `U+0259` — four digits minimum, more when the code point needs them. */
  hex: string;
  decimal: number;
  /** Space-separated uppercase hex bytes: `C9 99`. */
  utf8: string;
  /** Space-separated UTF-16 code units: `0259`, or `D83D DC4D` for a pair. */
  utf16: string;
  /** The numeric HTML entity, which every character has: `&#601;`. */
  entity: string;
  /** Azerbaijani, and derived from the Unicode category when not named here. */
  name: string;
  /** True when the character renders nothing — the plain space excepted. */
  invisible: boolean;
  /** Present when the character is worth stopping on. Azerbaijani. */
  warning?: string;
};

/*
 * How many code points the inspector will describe.
 *
 * Every row is an object plus a table row, so a pasted 100 KB file would be a
 * hundred thousand of both and a locked tab. The cap is on the inspector and
 * not on `textSummary`, which walks the same string without allocating and can
 * therefore report the honest totals for the whole input — the component shows
 * those next to a note saying the table below is the first slice.
 */
export const INSPECT_LIMIT = 2000;

const encoder = new TextEncoder();

const HIGHEST_CODE_POINT = 0x10ffff;
const SURROGATE_FIRST = 0xd800;
const SURROGATE_LAST = 0xdfff;
const ASCII_LAST = 0x7f;
const PLAIN_SPACE = 0x20;

/** The stand-in drawn for a character that has no ink of its own. */
const BLANK_GLYPH = "·";
/** The dotted circle a combining mark is drawn on so it has something to sit on. */
const COMBINING_BASE = "◌";

function upperFirst(value: string): string {
  if (value === "") return value;
  return value.charAt(0).toLocaleUpperCase("az") + value.slice(1);
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function utf8Of(char: string): string {
  return Array.from(encoder.encode(char), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, "0"),
  ).join(" ");
}

function utf16Of(char: string): string {
  const units: string[] = [];
  for (let index = 0; index < char.length; index += 1) {
    units.push(char.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0"));
  }
  return units.join(" ");
}

/* ---------- the C0 control characters ---------- */

type ControlChar = {
  code: number;
  /** The three-letter name every ASCII chart prints. */
  abbr: string;
  name: string;
  note: string;
  /** Absent for tab, newline and carriage return: expected, not suspicious. */
  warning?: string;
};

/*
 * All thirty-three of them, because the reference table needs the whole chart
 * and the inspector needs the names — keeping two lists would guarantee they
 * disagree about DC3 within a month.
 */
const CONTROL_CHARS: ControlChar[] = [
  {
    code: 0x00,
    abbr: "NUL",
    name: "Boş simvol",
    note: "Sıfır bayt; C dilində sətrin sonunu bildirir, ona görə mətnin ortasında sətri kəsir.",
    warning: "Sıfır bayt: mətnin ortasında sətri kəsir və faylı yarımçıq oxudur.",
  },
  {
    code: 0x01,
    abbr: "SOH",
    name: "Başlığın başlanğıcı",
    note: "Köhnə ötürmə protokollarında paketin başlıq hissəsinin başladığını bildirirdi.",
    warning: "Nəzarət simvolu (SOH): adi mətndə olmamalıdır.",
  },
  {
    code: 0x02,
    abbr: "STX",
    name: "Mətnin başlanğıcı",
    note: "Başlıq bitib, blokun məzmununun başladığını bildirən köhnə xətt siqnalı.",
    warning: "Nəzarət simvolu (STX): adi mətndə olmamalıdır.",
  },
  {
    code: 0x03,
    abbr: "ETX",
    name: "Mətnin sonu",
    note: "Terminalda Ctrl+C bunu göndərir və işləyən prosesi dayandırır.",
    warning: "Nəzarət simvolu (ETX): adi mətndə olmamalıdır.",
  },
  {
    code: 0x04,
    abbr: "EOT",
    name: "Ötürmənin sonu",
    note: "Terminalda Ctrl+D bunu göndərir və girişin bitdiyini bildirir.",
    warning: "Nəzarət simvolu (EOT): adi mətndə olmamalıdır.",
  },
  {
    code: 0x05,
    abbr: "ENQ",
    name: "Sorğu",
    note: "Qarşı tərəfdən özünü tanıtmasını tələb edən köhnə xətt sorğusu.",
    warning: "Nəzarət simvolu (ENQ): adi mətndə olmamalıdır.",
  },
  {
    code: 0x06,
    abbr: "ACK",
    name: "Təsdiq",
    note: "Göndərilən blokun düzgün alındığını bildirən cavab siqnalı.",
    warning: "Nəzarət simvolu (ACK): adi mətndə olmamalıdır.",
  },
  {
    code: 0x07,
    abbr: "BEL",
    name: "Zəng",
    note: "Terminalda səs çıxarır və ya ekranı bir dəfə yandırıb söndürür.",
    warning: "Nəzarət simvolu (BEL): terminalda səs çıxarır.",
  },
  {
    code: 0x08,
    abbr: "BS",
    name: "Geri boşluq",
    note: "Kursoru bir simvol geri aparır; klaviaturadakı Backspace düyməsi budur.",
    warning: "Nəzarət simvolu (BS): adi mətndə olmamalıdır.",
  },
  {
    code: 0x09,
    abbr: "HT",
    name: "Tabulyasiya",
    note: "Üfüqi tabulyasiya; girinti üçün işlənir və Makefile-da boşluqla əvəz edilə bilmir.",
  },
  {
    code: 0x0a,
    abbr: "LF",
    name: "Sətir keçidi",
    note: "Unix, Linux və macOS-da sətrin sonu məhz budur; JSON-da \\n kimi yazılır.",
  },
  {
    code: 0x0b,
    abbr: "VT",
    name: "Şaquli tabulyasiya",
    note: "Şaquli tabulyasiya; müasir mətndə demək olar heç işlənmir, qalıq simvoldur.",
    warning: "Nəzarət simvolu (VT): adi mətndə olmamalıdır.",
  },
  {
    code: 0x0c,
    abbr: "FF",
    name: "Səhifə keçidi",
    note: "Printerə cari səhifəni bitirib yenisindən başlamağı bildirən simvol.",
    warning: "Nəzarət simvolu (FF): adi mətndə olmamalıdır.",
  },
  {
    code: 0x0d,
    abbr: "CR",
    name: "Karetka qayıdışı",
    note: "Windows sətir sonunu CR LF cütü ilə yazır; tək qalanda faylda ^M kimi görünür.",
  },
  {
    code: 0x0e,
    abbr: "SO",
    name: "Kod cədvəlindən çıxış",
    note: "Sonrakı simvolların alternativ kod cədvəlindən oxunmasını bildirirdi.",
    warning: "Nəzarət simvolu (SO): adi mətndə olmamalıdır.",
  },
  {
    code: 0x0f,
    abbr: "SI",
    name: "Kod cədvəlinə qayıdış",
    note: "Kod cədvəlini standart vəziyyətinə qaytaran cüt siqnaldır.",
    warning: "Nəzarət simvolu (SI): adi mətndə olmamalıdır.",
  },
  {
    code: 0x10,
    abbr: "DLE",
    name: "Kanal qaçırması",
    note: "Sonrakı baytın məlumat yox, nəzarət kimi oxunmasını bildirən qaçırma simvolu.",
    warning: "Nəzarət simvolu (DLE): adi mətndə olmamalıdır.",
  },
  {
    code: 0x11,
    abbr: "DC1",
    name: "Cihaz nəzarəti 1",
    note: "XON kimi tanınır; dayandırılmış ötürməni yenidən davam etdirir.",
    warning: "Nəzarət simvolu (DC1/XON): adi mətndə olmamalıdır.",
  },
  {
    code: 0x12,
    abbr: "DC2",
    name: "Cihaz nəzarəti 2",
    note: "Cihazdan asılı funksiya üçün ayrılıb; standart mənası yoxdur.",
    warning: "Nəzarət simvolu (DC2): adi mətndə olmamalıdır.",
  },
  {
    code: 0x13,
    abbr: "DC3",
    name: "Cihaz nəzarəti 3",
    note: "XOFF kimi tanınır; terminalda Ctrl+S ilə ötürməni dayandırır.",
    warning: "Nəzarət simvolu (DC3/XOFF): adi mətndə olmamalıdır.",
  },
  {
    code: 0x14,
    abbr: "DC4",
    name: "Cihaz nəzarəti 4",
    note: "Cihazı dayandırmaq üçün ayrılmış dördüncü nəzarət siqnalıdır.",
    warning: "Nəzarət simvolu (DC4): adi mətndə olmamalıdır.",
  },
  {
    code: 0x15,
    abbr: "NAK",
    name: "İnkar təsdiqi",
    note: "Alınan blokun səhv gəldiyini və təkrar göndərilməli olduğunu bildirir.",
    warning: "Nəzarət simvolu (NAK): adi mətndə olmamalıdır.",
  },
  {
    code: 0x16,
    abbr: "SYN",
    name: "Sinxronlaşma",
    note: "Boş xətdə iki tərəfin ritmini saxlamaq üçün göndərilən doldurucu siqnal.",
    warning: "Nəzarət simvolu (SYN): adi mətndə olmamalıdır.",
  },
  {
    code: 0x17,
    abbr: "ETB",
    name: "Blokun sonu",
    note: "Uzun mesaj bloklara bölünəndə hər blokun sonunu bildirən simvol.",
    warning: "Nəzarət simvolu (ETB): adi mətndə olmamalıdır.",
  },
  {
    code: 0x18,
    abbr: "CAN",
    name: "Ləğv",
    note: "Əvvəl göndərilən məlumatın etibarsız olduğunu və atılmalı olduğunu bildirir.",
    warning: "Nəzarət simvolu (CAN): adi mətndə olmamalıdır.",
  },
  {
    code: 0x19,
    abbr: "EM",
    name: "Daşıyıcının sonu",
    note: "Lentin və ya perfokartın fiziki olaraq bitdiyini bildirən simvol idi.",
    warning: "Nəzarət simvolu (EM): adi mətndə olmamalıdır.",
  },
  {
    code: 0x1a,
    abbr: "SUB",
    name: "Əvəzləyici",
    note: "DOS-da faylın sonu kimi işlənirdi; terminalda Ctrl+Z bunu göndərir.",
    warning: "Nəzarət simvolu (SUB): adi mətndə olmamalıdır.",
  },
  {
    code: 0x1b,
    abbr: "ESC",
    name: "Qaçırma",
    note: "Terminalın rəng və kursor ardıcıllıqları məhz bu simvolla başlayır.",
    warning: "Nəzarət simvolu (ESC): terminal ardıcıllığının başlanğıcıdır.",
  },
  {
    code: 0x1c,
    abbr: "FS",
    name: "Fayl ayırıcısı",
    note: "Bir axında ardıcıl gələn faylları bir-birindən ayırmaq üçün ayrılıb.",
    warning: "Nəzarət simvolu (FS): adi mətndə olmamalıdır.",
  },
  {
    code: 0x1d,
    abbr: "GS",
    name: "Qrup ayırıcısı",
    note: "Qeyd qruplarını ayırır; GS1 barkod standartlarında bu gün də işlənir.",
    warning: "Nəzarət simvolu (GS): barkod məlumatından gələ bilər.",
  },
  {
    code: 0x1e,
    abbr: "RS",
    name: "Qeyd ayırıcısı",
    note: "Qeydləri ayırır; RFC 7464 formatında JSON qeydlərinin qarşısında durur.",
    warning: "Nəzarət simvolu (RS): adi mətndə olmamalıdır.",
  },
  {
    code: 0x1f,
    abbr: "US",
    name: "Vahid ayırıcısı",
    note: "Bir qeydin daxilindəki sahələri bir-birindən ayırmaq üçün ayrılıb.",
    warning: "Nəzarət simvolu (US): adi mətndə olmamalıdır.",
  },
  {
    code: 0x7f,
    abbr: "DEL",
    name: "Silmə",
    note: "Deşikli lentdə bütün deşikləri açıb səhv yazılmış simvolu ləğv edirdi.",
    warning: "Nəzarət simvolu (DEL): adi mətndə olmamalıdır.",
  },
];

const CONTROL_BY_CODE = new Map(CONTROL_CHARS.map((item) => [item.code, item]));

/* ---------- the characters worth stopping on ---------- */

type FlaggedChar = {
  name: string;
  warning: string;
  /** The reference note. Longer than the warning, and says where it comes from. */
  note: string;
  /** True when the character draws nothing at all. */
  blank: boolean;
  abbr?: string;
};

/*
 * The whole point of the tool, in one table: characters that either draw
 * nothing or draw something a person reads as an ordinary character while a
 * comparison reads it as a different one.
 */
const FLAGGED: [number, FlaggedChar][] = [
  [
    0x00a0,
    {
      name: "Qırılmayan boşluq",
      abbr: "NBSP",
      warning: "Qırılmayan boşluq: adi boşluğa oxşayır, amma sətir onun üstündən qırılmır.",
      note: "Adi boşluq kimi görünür, lakin kod onu boşluq saymır; Word-dən kopyalanan mətnin ən çox gətirdiyi simvoldur.",
      blank: true,
    },
  ],
  [
    0x00ad,
    {
      name: "Yumşaq defis",
      abbr: "SHY",
      warning: "Yumşaq defis: yalnız söz sətir sonunda qırılanda görünür, qalan vaxt gizlidir.",
      note: "Sözü harada qırmağın mümkün olduğunu bildirir; ekranda görünmür, ona görə axtarışı və müqayisəni sındırır.",
      blank: true,
    },
  ],
  [
    0x200b,
    {
      name: "Sıfır enli boşluq",
      abbr: "ZWSP",
      warning: "Sıfır enli boşluq: sözü görünmədən bölür və müqayisəni sındırır.",
      note: "Eni sıfır olan boşluq; uzun sözü qırmaq üçün qoyulur, sonra da qopyalanmış mətndə gizli qalır.",
      blank: true,
    },
  ],
  [
    0x200c,
    {
      name: "Sıfır enli qeyri-birləşdirici",
      abbr: "ZWNJ",
      warning: "Sıfır enli qeyri-birləşdirici: iki hərfin birləşməsinin qarşısını alır.",
      note: "Ərəb və fars yazısında iki hərfin bitişməsini dayandırır; latın mətnində görünməyən artıq simvoldur.",
      blank: true,
    },
  ],
  [
    0x200d,
    {
      name: "Sıfır enli birləşdirici",
      abbr: "ZWJ",
      warning: "Sıfır enli birləşdirici: emoji hissələrini bir qrafemə yapışdırır.",
      note: "Ailə və peşə emojiləri məhz bununla qurulur; ona görə bir emoji beş kod nöqtəsindən ibarət ola bilir.",
      blank: true,
    },
  ],
  [
    0x200e,
    {
      name: "Soldan-sağa nişanı",
      abbr: "LRM",
      warning: "İstiqamət nişanı: mətnin görünən sırasını dəyişir.",
      note: "Qarışıq istiqamətli mətndə sıranı düzəltmək üçün qoyulur; görünmür, amma sətrin oxunuşunu dəyişir.",
      blank: true,
    },
  ],
  [
    0x200f,
    {
      name: "Sağdan-sola nişanı",
      abbr: "RLM",
      warning: "İstiqamət nişanı: mətnin görünən sırasını dəyişir.",
      note: "Ərəb və ivrit mətnində sıranı düzəldir; latın mətninə düşəndə heç bir iz qoymadan sıranı pozur.",
      blank: true,
    },
  ],
  [
    0x2060,
    {
      name: "Söz birləşdirici",
      abbr: "WJ",
      warning: "Söz birləşdirici: görünmür və sətrin qırılmasının qarşısını alır.",
      note: "Sətrin bu nöqtədə qırılmasını qadağan edir; eni yoxdur, ona görə mətndə heç bir iz buraxmır.",
      blank: true,
    },
  ],
  [
    0xfeff,
    {
      name: "Bayt sırası nişanı",
      abbr: "BOM",
      warning: "BOM: faylın əvvəlində gizli qalır və JSON parserini sındırır.",
      note: "Faylın kodlaşdırmasını bildirmək üçün əvvələ qoyulur; UTF-8 faylında lazım deyil və çox vaxt xəta mənbəyidir.",
      blank: true,
    },
  ],
  [
    0x202f,
    {
      name: "Dar qırılmayan boşluq",
      abbr: "NNBSP",
      warning: "Dar qırılmayan boşluq: adi boşluq kimi görünür, kod isə onu boşluq saymır.",
      note: "Rəqəmlə vahid arasında işlənən dar boşluq; adi boşluqdan yalnız eni ilə fərqlənir və gözlə seçilmir.",
      blank: true,
    },
  ],
  [
    0x2007,
    {
      name: "Rəqəm boşluğu",
      abbr: "FIGURE SPACE",
      warning: "Rəqəm boşluğu: adi boşluq deyil, eni rəqəmin eni qədərdir.",
      note: "Cədvəldə rəqəmləri düzləndirmək üçün işlənir; adi boşluqla eyni görünür, amma başqa kod nöqtəsidir.",
      blank: true,
    },
  ],
  [
    0x3000,
    {
      name: "İdeoqrafik boşluq",
      abbr: "IDEOGRAPHIC SPACE",
      warning: "İdeoqrafik boşluq: Yapon klaviaturasından gələn geniş boşluqdur.",
      note: "CJK mətnində işlənən geniş boşluq; latın mətninə düşəndə iki boşluq kimi görünür və trim funksiyalarını çaşdırır.",
      blank: true,
    },
  ],
  [
    0x2028,
    {
      name: "Sətir ayırıcısı",
      abbr: "LS",
      warning: "Sətir ayırıcısı: köhnə JavaScript sətirlərində sintaksis xətası yaradırdı.",
      note: "Unicode-un öz sətir ayırıcısı; JSON-da qaçırılmır və köhnə JS parserlərini sındırırdı.",
      blank: true,
    },
  ],
  [
    0x2029,
    {
      name: "Abzas ayırıcısı",
      abbr: "PS",
      warning: "Abzas ayırıcısı: adi sətir keçidi deyil, ayrıca kod nöqtəsidir.",
      note: "Unicode-un abzas ayırıcısı; mətn redaktorlarından kopyalananda adi sətir keçidi kimi görünür.",
      blank: true,
    },
  ],
  [
    0x202a,
    {
      name: "Soldan-sağa gömmə",
      abbr: "LRE",
      warning: "İstiqamət nəzarəti: mənbə kodunda görünən sıranı dəyişir, təhlükəsizlik riskidir.",
      note: "Mətn parçasını soldan-sağa oxumağa məcbur edir; mənbə kodunda gizli məntiq gizlətmək üçün istifadə edilib.",
      blank: true,
    },
  ],
  [
    0x202b,
    {
      name: "Sağdan-sola gömmə",
      abbr: "RLE",
      warning: "İstiqamət nəzarəti: mənbə kodunda görünən sıranı dəyişir, təhlükəsizlik riskidir.",
      note: "Mətn parçasını sağdan-sola oxumağa məcbur edir; Trojan Source hücumunun əsas simvollarından biridir.",
      blank: true,
    },
  ],
  [
    0x202c,
    {
      name: "İstiqamət formatının sonu",
      abbr: "PDF",
      warning: "İstiqamət nəzarəti: açılmış istiqamət blokunu bağlayır.",
      note: "Əvvəl açılmış gömmə və ya üstələmə blokunu bağlayır; tək başına heç nə göstərmir.",
      blank: true,
    },
  ],
  [
    0x202d,
    {
      name: "Soldan-sağa üstələmə",
      abbr: "LRO",
      warning: "İstiqamət nəzarəti: simvolların görünən sırasını zorla dəyişir.",
      note: "Simvolların təbii istiqamətini tamamilə əvəz edir; fayl adını tərsinə göstərmək üçün istifadə edilib.",
      blank: true,
    },
  ],
  [
    0x202e,
    {
      name: "Sağdan-sola üstələmə",
      abbr: "RLO",
      warning: "İstiqamət nəzarəti: fayl adını və kod sətrini tərsinə göstərə bilər.",
      note: "Ən çox sui-istifadə olunan istiqamət simvolu; exe faylını txt kimi göstərən köhnə hiylə buna əsaslanır.",
      blank: true,
    },
  ],
  [
    0x2066,
    {
      name: "Soldan-sağa izolyasiya",
      abbr: "LRI",
      warning: "İstiqamət nəzarəti: mətn parçasını ətrafından təcrid edir.",
      note: "Parçanı ətraf mətnin istiqamətindən ayırır; Trojan Source hücumunda istifadə olunan dörd izolyatordan biridir.",
      blank: true,
    },
  ],
  [
    0x2067,
    {
      name: "Sağdan-sola izolyasiya",
      abbr: "RLI",
      warning: "İstiqamət nəzarəti: mətn parçasını ətrafından təcrid edir.",
      note: "Parçanı sağdan-sola oxunan ada olaraq təcrid edir; mənbə kodunda görünməyən sıra dəyişikliyi yaradır.",
      blank: true,
    },
  ],
  [
    0x2068,
    {
      name: "Birinci güclü izolyasiya",
      abbr: "FSI",
      warning: "İstiqamət nəzarəti: istiqaməti ilk hərfə görə seçir.",
      note: "İstiqaməti parçanın ilk güclü hərfindən götürür; adların qarışıq siyahısında işlənir, kodda isə yeri yoxdur.",
      blank: true,
    },
  ],
  [
    0x2069,
    {
      name: "İzolyasiyanın sonu",
      abbr: "PDI",
      warning: "İstiqamət nəzarəti: açılmış izolyasiya blokunu bağlayır.",
      note: "Əvvəl açılmış izolyasiya blokunu bağlayır; tək qalanda mətndə heç bir görünən iz buraxmır.",
      blank: true,
    },
  ],
  [
    0x2018,
    {
      name: "Açılan tək dırnaq",
      warning: "Ağıllı dırnaq: düz apostrof deyil; kodda sətri bağlamır.",
      note: "Redaktorların avtomatik qoyduğu əyri apostrof; kodda düz apostrofun yerinə düşəndə sətir bağlanmır.",
      blank: false,
    },
  ],
  [
    0x2019,
    {
      name: "Bağlanan tək dırnaq",
      warning: "Ağıllı dırnaq: düz apostrof deyil; kodda sətri bağlamır.",
      note: "Apostrof kimi də işlənir; düz apostrofla eyni görünür, amma başqa kod nöqtəsidir və axtarışa düşmür.",
      blank: false,
    },
  ],
  [
    0x201c,
    {
      name: "Açılan cüt dırnaq",
      warning: "Ağıllı dırnaq: düz cüt dırnaq deyil; JSON-da qəbul edilmir.",
      note: "Word və bloq redaktorlarının avtomatik qoyduğu əyri dırnaq; JSON-a yapışdırılanda parser xəta verir.",
      blank: false,
    },
  ],
  [
    0x201d,
    {
      name: "Bağlanan cüt dırnaq",
      warning: "Ağıllı dırnaq: düz cüt dırnaq deyil; JSON-da qəbul edilmir.",
      note: "Açılan cütünün qarşılığı; HTML atributuna düşəndə atribut bağlanmır və teq pozulur.",
      blank: false,
    },
  ],
  [
    0x2013,
    {
      name: "Qısa tire",
      warning: "Qısa tire: adi defis deyil; slug-da və kodda problem yaradır.",
      note: "Aralıq bildirmək üçün işlənən tire (2013–2026); klaviaturadakı defisdən uzundur və onunla eyni deyil.",
      blank: false,
    },
  ],
  [
    0x2014,
    {
      name: "Uzun tire",
      warning: "Uzun tire: adi defis deyil; slug-da və kodda problem yaradır.",
      note: "Cümlə içində fikri ayıran uzun tire; avtomatik əvəzləmə iki defisi buna çevirir və nəticə kodda sınır.",
      blank: false,
    },
  ],
  [
    0x0430,
    {
      name: "Kiril a hərfi",
      warning: "Kiril hərfi: latın a hərfi ilə eyni görünür, amma başqa simvoldur.",
      note: "Latın a hərfindən gözlə seçilmir; domen adlarında saxta ünvan qurmaq üçün istifadə olunur.",
      blank: false,
    },
  ],
  [
    0x043e,
    {
      name: "Kiril o hərfi",
      warning: "Kiril hərfi: latın o hərfi ilə eyni görünür, amma başqa simvoldur.",
      note: "Latın o hərfi ilə eyni çəkilir; parol və istifadəçi adında gizli fərq yaradır.",
      blank: false,
    },
  ],
  [
    0x0441,
    {
      name: "Kiril s hərfi",
      warning: "Kiril hərfi: latın c hərfi ilə eyni görünür, amma başqa simvoldur.",
      note: "Latın c hərfi ilə eyni çəkilir; kopyalanmış koda düşəndə heç bir redaktor bunu göstərmir.",
      blank: false,
    },
  ],
];

const FLAGGED_BY_CODE = new Map(FLAGGED);

/* ---------- naming what is not named by hand ---------- */

const SCRIPTS: [RegExp, string][] = [
  [/\p{Script=Latin}/u, "Latın"],
  [/\p{Script=Cyrillic}/u, "Kiril"],
  [/\p{Script=Greek}/u, "Yunan"],
  [/\p{Script=Arabic}/u, "Ərəb"],
  [/\p{Script=Hebrew}/u, "İbrani"],
  [/\p{Script=Armenian}/u, "Erməni"],
  [/\p{Script=Georgian}/u, "Gürcü"],
  [/\p{Script=Han}/u, "Çin"],
  [/\p{Script=Hiragana}/u, "Hiraqana"],
  [/\p{Script=Katakana}/u, "Katakana"],
  [/\p{Script=Hangul}/u, "Koreya"],
];

const CATEGORIES: [RegExp, string][] = [
  [/\p{Lu}/u, "böyük hərf"],
  [/\p{Ll}/u, "kiçik hərf"],
  [/\p{Lt}/u, "başlıq hərfi"],
  [/\p{Lm}/u, "modifikator hərf"],
  [/\p{Lo}/u, "hərf"],
  [/\p{Nd}/u, "onluq rəqəm"],
  [/\p{Nl}/u, "hərf-rəqəm"],
  [/\p{No}/u, "rəqəm işarəsi"],
  [/\p{Mn}/u, "birləşən işarə"],
  [/\p{Mc}/u, "birləşən işarə"],
  [/\p{Me}/u, "əhatələyən işarə"],
  [/\p{Pd}/u, "tire"],
  [/\p{Ps}/u, "açılan mötərizə"],
  [/\p{Pe}/u, "bağlanan mötərizə"],
  [/\p{Pi}/u, "açılan dırnaq"],
  [/\p{Pf}/u, "bağlanan dırnaq"],
  [/\p{Pc}/u, "birləşdirici durğu"],
  [/\p{Po}/u, "durğu işarəsi"],
  [/\p{Sm}/u, "riyazi işarə"],
  [/\p{Sc}/u, "valyuta işarəsi"],
  [/\p{Sk}/u, "modifikator işarə"],
  [/\p{So}/u, "işarə"],
  [/\p{Zs}/u, "boşluq"],
  [/\p{Zl}/u, "sətir ayırıcısı"],
  [/\p{Zp}/u, "abzas ayırıcısı"],
  [/\p{Cc}/u, "nəzarət simvolu"],
  [/\p{Cf}/u, "format simvolu"],
  [/\p{Cs}/u, "surroqat"],
  [/\p{Co}/u, "şəxsi istifadə"],
];

const COMBINING = /\p{M}/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const NO_INK = /[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}]/u;

function genericName(char: string): string {
  if (PICTOGRAPHIC.test(char) && char.codePointAt(0)! > ASCII_LAST) return "Emoji";

  const script = SCRIPTS.find(([pattern]) => pattern.test(char));
  const category = CATEGORIES.find(([pattern]) => pattern.test(char));
  const categoryName = category === undefined ? "simvol" : category[1];

  if (script === undefined) return upperFirst(categoryName);
  return `${script[1]} ${categoryName}`;
}

/* ---------- the inspector ---------- */

/** Everything the table shows about one code point. */
function describeChar(char: string): CharInfo {
  const codePoint = char.codePointAt(0) ?? 0;
  const control = CONTROL_BY_CODE.get(codePoint);
  const flagged = FLAGGED_BY_CODE.get(codePoint);

  const blank = control !== undefined || (flagged?.blank ?? false) || NO_INK.test(char);
  /* The plain space is the one character that draws nothing and surprises
     nobody, so it is not counted among the invisible ones. Everything else
     that leaves the line empty is. */
  const invisible = blank && codePoint !== PLAIN_SPACE;

  let display = char;
  if (blank) display = BLANK_GLYPH;
  else if (COMBINING.test(char)) display = COMBINING_BASE + char;

  const name = control?.name ?? flagged?.name ?? genericName(char);
  const warning = control?.warning ?? flagged?.warning;

  const info: CharInfo = {
    char,
    display,
    codePoint,
    hex: formatCodePoint(codePoint),
    decimal: codePoint,
    utf8: utf8Of(char),
    utf16: utf16Of(char),
    entity: `&#${codePoint};`,
    name,
    invisible,
  };
  if (warning !== undefined) info.warning = warning;
  return info;
}

/**
 * One row per code point, capped at `limit`.
 *
 * The string is iterated with `for...of` rather than indexed, so an emoji
 * outside the basic plane is one row and not two halves of a surrogate pair —
 * which is the whole reason the UTF-16 column exists beside it.
 */
export function inspectText(input: string, limit: number = INSPECT_LIMIT): CharInfo[] {
  const rows: CharInfo[] = [];
  for (const char of input) {
    if (rows.length >= limit) break;
    rows.push(describeChar(char));
  }
  return rows;
}

let segmenter: Intl.Segmenter | null = null;

/**
 * What a person would call "one character".
 *
 * Deliberately not `[...input].length`: a family emoji is five code points and
 * one thing on screen, and a letter with a combining accent is two and one.
 * `Intl.Segmenter` is the only thing that knows the difference, and the
 * fallback is the code-point count for the rare runtime without it.
 */
function countGraphemes(input: string): number {
  if (input === "") return 0;
  if (typeof Intl.Segmenter !== "function") return Array.from(input).length;
  if (segmenter === null) segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(input)).length;
}

/**
 * The five numbers that disagree with each other, plus the two counts worth
 * acting on. Walks the whole string — no cap — so the totals stay honest even
 * when the table under them is only the first slice.
 */
export function textSummary(input: string): {
  codePoints: number;
  graphemes: number;
  utf8Bytes: number;
  utf16Units: number;
  nonAscii: number;
  invisible: number;
} {
  let codePoints = 0;
  let nonAscii = 0;
  let invisible = 0;

  for (const char of input) {
    codePoints += 1;
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint > ASCII_LAST) nonAscii += 1;
    if (codePoint !== PLAIN_SPACE && (CONTROL_BY_CODE.has(codePoint) || NO_INK.test(char))) {
      invisible += 1;
    }
  }

  return {
    codePoints,
    graphemes: countGraphemes(input),
    utf8Bytes: encoder.encode(input).length,
    utf16Units: input.length,
    nonAscii,
    invisible,
  };
}

const ENTITY_FORM = /^&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?$/;
const PREFIXED_FORM = /^(?:[uU]\+|0[xX]|\\[uU]\{?)([0-9a-fA-F]{1,6})\}?$/;
const BARE_FORM = /^[0-9a-fA-F]{2,6}$/;
const DIGITS_ONLY = /^[0-9]+$/;

function fromCodePoint(codePoint: number): CharInfo | null {
  if (!Number.isInteger(codePoint)) return null;
  if (codePoint < 0 || codePoint > HIGHEST_CODE_POINT) return null;
  /* A lone surrogate is not a character: `TextEncoder` would hand back the
     replacement bytes and the UTF-8 column would be a lie. */
  if (codePoint >= SURROGATE_FIRST && codePoint <= SURROGATE_LAST) return null;
  return describeChar(String.fromCodePoint(codePoint));
}

/**
 * The search box: the same character reached from whichever direction the
 * visitor already has it in.
 *
 * The one genuine ambiguity is a bare run of digits — `0259` is how a code
 * point is written without its prefix, `601` is how the same character is
 * written in decimal. The rule is the one a reader already applies: a leading
 * zero means it is being written as a code point, so it is hex; otherwise it
 * is a number, so it is decimal. A single typed character always wins over
 * both, which is what keeps `a` the letter and not 0x0A.
 */
export function lookupCodePoint(input: string): CharInfo | null {
  const raw = input.trim();
  if (raw === "") return null;

  const entity = ENTITY_FORM.exec(raw);
  if (entity !== null) {
    const hex = entity[1];
    const decimal = entity[2];
    if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16));
    if (decimal !== undefined) return fromCodePoint(Number.parseInt(decimal, 10));
  }

  const prefixed = PREFIXED_FORM.exec(raw);
  if (prefixed !== null && prefixed[1] !== undefined) {
    return fromCodePoint(Number.parseInt(prefixed[1], 16));
  }

  const points = Array.from(raw);
  if (points.length === 1 && points[0] !== undefined) return describeChar(points[0]);

  if (BARE_FORM.test(raw)) {
    const asDecimal = DIGITS_ONLY.test(raw) && !raw.startsWith("0");
    return fromCodePoint(Number.parseInt(raw, asDecimal ? 10 : 16));
  }

  return null;
}

/* ---------- the reference table ---------- */

export const asciiUnicodeSections: ReferenceSection[] = [
  {
    id: "nezaret",
    label: "Nəzarət simvolları",
    hint: "0–31 və 127. Heç biri ekranda görünmür; çoxu teleks dövründən qalıb, bir neçəsi bu gün də hər faylda var.",
  },
  {
    id: "ascii",
    label: "Çap olunan ASCII",
    hint: "32–126. Bir baytla yazılan 95 simvol: bütün proqramlaşdırma dillərinin ortaq əsası.",
  },
  {
    id: "az",
    label: "Azərbaycan hərfləri",
    hint: "Latın əsasını genişləndirən 16 hərf. Hər birinin öz tələsi var: böyük-kiçik çevirməsi və şrift alt dəsti.",
  },
  {
    id: "gorunmez",
    label: "Görünməz və çaşdıran",
    hint: "Ekranda ya heç nə göstərmir, ya da başqa simvolla eyni görünür. Səhvlərin əsl mənbəyi buradadır.",
  },
  {
    id: "isare",
    label: "Tez-tez lazım olan işarələr",
    hint: "Klaviaturada olmayan, amma mətndə lazım olan işarələr və onların HTML qarşılıqları.",
  },
];

type RowOptions = {
  /** What the term prints when the character itself has no ink. */
  display?: string;
  example?: string;
  match?: string[];
};

/*
 * Every row is built from the character itself, so the code point, the decimal
 * value and the UTF-8 bytes cannot disagree with it — the one class of mistake
 * a hand-typed ASCII table always makes.
 */
function charRow(
  char: string,
  section: string,
  note: string,
  options: RowOptions = {},
): ReferenceRow {
  const codePoint = char.codePointAt(0) ?? 0;
  const hex = formatCodePoint(codePoint);
  const row: ReferenceRow = {
    term: `${options.display ?? char} (${hex})`,
    label: `${codePoint} · UTF-8 ${utf8Of(char)}`,
    note,
    section,
    match: [
      ...(options.match ?? []),
      String(codePoint),
      hex.slice(2),
      `&#${codePoint};`,
    ],
  };
  if (options.example !== undefined) row.example = options.example;
  return row;
}

const controlRows: ReferenceRow[] = CONTROL_CHARS.map((control) =>
  charRow(String.fromCodePoint(control.code), "nezaret", control.note, {
    display: control.abbr,
    match: [control.abbr, control.name, control.code === 0x09 ? "tab" : ""],
  }),
);

/*
 * The printable half, 32 to 126. Letters and digits are generated because the
 * only thing worth saying about them is the arithmetic — the 32 that separates
 * a case pair, and the 48 that separates a digit from its code — and writing
 * that out ninety-five times by hand is how a table gets one of them wrong.
 */
const PUNCTUATION_NOTES: [string, string, string[]][] = [
  [" ", "Sözləri ayıran adi boşluq; URL-də %20, sorğu sətrində isə bəzən + kimi kodlanır.", ["bosluq", "space"]],
  ["!", "Nida işarəsi; əksər dillərdə inkar operatorudur və != şəklində bərabərsizlik qurur.", ["nida", "inkar"]],
  ['"', "Düz cüt dırnaq; HTML atributunu və JSON açarını bağlayır, &quot; ilə qaçırılır.", ["dirnaq", "quote"]],
  ["#", "Diyez; URL-də fraqmentin başlanğıcı, Markdown-da başlıq, çox dildə şərh işarəsi.", ["diyez", "hash", "fraqment"]],
  ["$", "Dollar işarəsi; shell-də dəyişən oxunuşu, regex-də isə sətrin sonunu bildirir.", ["dollar", "deyisen"]],
  ["%", "Faiz işarəsi; URL kodlamasında qaçırma prefiksi, çox dildə qalıq operatorudur.", ["faiz", "percent"]],
  ["&", "Ampersand; URL-də parametrləri ayırır və HTML mətnində &amp; kimi yazılmalıdır.", ["ampersand", "ve"]],
  ["'", "Düz apostrof; SQL sətrini bağlayır və inyeksiya hücumlarında ən çox işlənən simvoldur.", ["apostrof", "dirnaq"]],
  ["(", "Açılan dairəvi mötərizə; funksiya çağırışını və regex qrupunu başladır.", ["moterize", "qovsaq"]],
  [")", "Bağlanan dairəvi mötərizə; açılan cütü olmadan sintaksis xətası verir.", ["moterize", "qovsaq"]],
  ["*", "Ulduz; vurma operatoru, regex-də sıfır və ya daha çox təkrar, fayl adında joker.", ["ulduz", "vurma"]],
  ["+", "Plus; toplama operatoru, regex-də bir və ya daha çox təkrar, URL-də boşluq əvəzi.", ["plus", "toplama"]],
  [",", "Vergül; CSV sütun ayırıcısı və demək olar hər dildə arqument ayırıcısıdır.", ["vergul", "comma"]],
  ["-", "Düz defis-minus; slug-da söz ayırıcısı, uzun tire ilə qarışdırılmamalıdır.", ["defis", "minus", "tire"]],
  [".", "Nöqtə; domen hissələrini ayırır, regex-də isə istənilən bir simvol deməkdir.", ["noqte", "dot"]],
  ["/", "Slash; URL yolunu və Unix qovluqlarını ayırır, bölmə operatoru kimi də işlənir.", ["slash", "kesr"]],
  [":", "İki nöqtə; sxem, port, JSON açar-dəyər və CSS xassə ayırıcısıdır.", ["iki noqte", "colon"]],
  [";", "Nöqtəli vergül; ifadə sonu və HTML entity-nin bağlayıcı simvoludur.", ["noqteli vergul", "semicolon"]],
  ["<", "Kiçikdir işarəsi; HTML teqini açır və mətndə &lt; ilə qaçırılmalıdır.", ["kicikdir", "teq"]],
  ["=", "Bərabərdir; mənimsətmə operatoru və sorğu parametrinin dəyər ayırıcısıdır.", ["beraberdir", "equals"]],
  [">", "Böyükdür işarəsi; HTML teqini bağlayır və mətndə &gt; ilə qaçırılmalıdır.", ["boyukdur", "teq"]],
  ["?", "Sual işarəsi; URL-də sorğu sətrini başladır, regex-də isə seçimlilik bildirir.", ["sual", "sorgu"]],
  ["@", "At işarəsi; e-poçt ünvanında istifadəçi adı ilə domeni ayırır.", ["at", "epoct"]],
  ["[", "Açılan kvadrat mötərizə; massiv indeksini və regex simvol dəstini açır.", ["kvadrat moterize", "massiv"]],
  ["\\", "Əks slash; qaçırma simvoludur və Windows yollarında qovluq ayırıcısı kimi işlənir.", ["backslash", "eks slash"]],
  ["]", "Bağlanan kvadrat mötərizə; açılan cütü olmadan massiv və dəst bağlanmır.", ["kvadrat moterize", "massiv"]],
  ["^", "Sirkumfleks; regex-də sətir başlanğıcı, bir çox dildə isə XOR operatorudur.", ["sirkumfleks", "xor"]],
  ["_", "Alt xətt; snake_case adlarda söz ayırıcısı, bəzi dillərdə istifadəsiz dəyər nişanı.", ["alt xett", "underscore"]],
  ["`", "Backtick; Markdown-da kod parçası, JavaScript-də şablon sətri açır.", ["backtick", "eks apostrof"]],
  ["{", "Açılan fiqurlu mötərizə; blok, obyekt və şablon ifadəsini başladır.", ["fiqurlu moterize", "blok"]],
  ["|", "Şaquli xətt; shell-də boru xətti, regex və tip sistemlərində «və ya» deməkdir.", ["pipe", "saquli xett"]],
  ["}", "Bağlanan fiqurlu mötərizə; açılan cütü olmadan blok bağlanmır.", ["fiqurlu moterize", "blok"]],
  ["~", "Tilda; ev qovluğunun qısaltması və semver-də «təxminən bu versiya» operatorudur.", ["tilda", "ev qovlugu"]],
];

const DIGIT_CODE_BASE = 48;
const CASE_DISTANCE = 32;

function digitRows(): ReferenceRow[] {
  const rows: ReferenceRow[] = [];
  for (let digit = 0; digit <= 9; digit += 1) {
    const char = String(digit);
    rows.push(
      charRow(
        char,
        "ascii",
        `Onluq rəqəm ${digit}; ASCII kodu ${DIGIT_CODE_BASE + digit}, yəni rəqəmin özündən ${DIGIT_CODE_BASE} böyükdür.`,
        { match: ["reqem", "digit"] },
      ),
    );
  }
  return rows;
}

function letterRows(): ReferenceRow[] {
  const rows: ReferenceRow[] = [];
  for (let code = 0x41; code <= 0x5a; code += 1) {
    const upper = String.fromCodePoint(code);
    const lower = String.fromCodePoint(code + CASE_DISTANCE);
    rows.push(
      charRow(
        upper,
        "ascii",
        `Latın böyük ${upper} hərfi; kiçik ${lower} hərfindən düz ${CASE_DISTANCE} kod nöqtəsi əvvəldədir.`,
        { match: ["boyuk herf", "uppercase"] },
      ),
    );
  }
  for (let code = 0x61; code <= 0x7a; code += 1) {
    const lower = String.fromCodePoint(code);
    const upper = String.fromCodePoint(code - CASE_DISTANCE);
    rows.push(
      charRow(
        lower,
        "ascii",
        `Latın kiçik ${lower} hərfi; böyük ${upper} hərfindən düz ${CASE_DISTANCE} kod nöqtəsi sonradır.`,
        { match: ["kicik herf", "lowercase"] },
      ),
    );
  }
  return rows;
}

const asciiRows: ReferenceRow[] = [
  ...PUNCTUATION_NOTES.map(([char, note, match]) =>
    charRow(char, "ascii", note, {
      display: char === " " ? BLANK_GLYPH : char,
      match,
    }),
  ),
  ...digitRows(),
  ...letterRows(),
];

/*
 * The sixteen letters that separate Azerbaijani from plain Latin, each with
 * the specific thing that goes wrong. Three of them are not trivia: the
 * dotless and dotted i pair inverts what every English-trained case function
 * assumes, and the schwa lives in a font subset a careless `next/font` call
 * does not load.
 */
const azRows: ReferenceRow[] = [
  charRow(
    "ə",
    "az",
    "Şva; Azərbaycan mətnində ən çox işlənən hərf və latın-ext alt dəstindədir: yalnız latin yüklənən şrift onu sistem sriftinə atır.",
    { example: 'subsets: ["latin", "latin-ext"]', match: ["schwa", "sva", "latin-ext", "srift"] },
  ),
  charRow(
    "Ə",
    "az",
    "Böyük şva; kiçik ə hərfindən 400 kod nöqtəsi uzaqdır, ona görə +32 hesabı burada işləmir.",
    { match: ["schwa", "sva", "boyuk"] },
  ),
  charRow(
    "ğ",
    "az",
    "Qısa işarəli g; latın-ext alt dəstindədir və köhnə ISO-8859-1 kodlamasında ümumiyyətlə yoxdur.",
    { match: ["breve", "yumsaq g"] },
  ),
  charRow(
    "Ğ",
    "az",
    "Böyük qısa işarəli G; kiçiyi ilə arasındakı fərq bir kod nöqtəsidir, ona görə sıralama düz işləyir.",
    { match: ["breve", "boyuk"] },
  ),
  charRow(
    "ı",
    "az",
    "Nöqtəsiz i; böyüyü I hərfidir, i deyil: İngilis qaydası ilə böyüdüləndə səhv hərf alınır.",
    { example: '"ı".toLocaleUpperCase("az") === "I"', match: ["noqtesiz", "dotless"] },
  ),
  charRow(
    "I",
    "az",
    "Adi latın böyük I; Azərbaycan dilində kiçiyi ı hərfidir və bunu yalnız az lokalı bilir.",
    { example: '"I".toLocaleLowerCase("az") === "ı"', match: ["boyuk i", "lokal"] },
  ),
  charRow(
    "İ",
    "az",
    "Nöqtəli böyük I; JavaScript-də lokalsız kiçildiləndə i hərfi plus U+0307 birləşən nöqtə verir və müqayisə sınır.",
    { example: '"İ".toLowerCase().length === 2', match: ["noqteli", "tolowercase", "0307"] },
  ),
  charRow(
    "i",
    "az",
    "Adi latın kiçik i; Azərbaycan dilində böyüyü İ hərfidir, ona görə lokalsız böyütmə səhv nəticə verir.",
    { example: '"i".toLocaleUpperCase("az") === "İ"', match: ["kicik i", "lokal"] },
  ),
  charRow(
    "ş",
    "az",
    "Quyruqlu s; quyruq sedil yox, komma altıdır və rumın ș hərfi ilə eyni deyil.",
    { match: ["sedil", "cedilla"] },
  ),
  charRow(
    "Ş",
    "az",
    "Böyük quyruqlu S; kiçiyi ilə fərqi bir kod nöqtəsidir və Unicode sıralamasında yan-yana dayanır.",
    { match: ["sedil", "boyuk"] },
  ),
  charRow(
    "ç",
    "az",
    "Quyruqlu c; latın-1 dəstində olduğuna görə köhnə sistemlərdə ə və ğ hərflərindən daha az problem verir.",
    { match: ["sedil", "cedilla"] },
  ),
  charRow(
    "Ç",
    "az",
    "Böyük quyruqlu C; latın-1 dəstindədir və demək olar hər şriftdə hazır çəkilib.",
    { match: ["sedil", "boyuk"] },
  ),
  charRow(
    "ö",
    "az",
    "İki nöqtəli o; latın-1 dəstindədir, alman ö hərfi ilə eyni kod nöqtəsini bölüşür.",
    { match: ["umlaut", "iki noqte"] },
  ),
  charRow(
    "Ö",
    "az",
    "Böyük iki nöqtəli O; NFD normallaşdırmasında O plus U+0308 kimi iki kod nöqtəsinə ayrıla bilir.",
    { match: ["umlaut", "nfd", "0308"] },
  ),
  charRow(
    "ü",
    "az",
    "İki nöqtəli u; latın-1 dəstindədir və URL-də punycode ilə xn-- formasına çevrilir.",
    { match: ["umlaut", "punycode"] },
  ),
  charRow(
    "Ü",
    "az",
    "Böyük iki nöqtəli U; kiçiyi ilə arasındakı fərq 32-dir, çünki hər ikisi latın-1 dəstindədir.",
    { match: ["umlaut", "boyuk"] },
  ),
];

const SIGN_NOTES: [string, string, string, string[]][] = [
  ["—", "&mdash;", "Uzun tire; cümlə içində fikri ayırır, defis deyil və slug-da işlənmir.", ["uzun tire", "em dash"]],
  ["–", "&ndash;", "Qısa tire; say və tarix aralığı üçündür, məsələn 2013–2026 yazılışında.", ["qisa tire", "en dash"]],
  ["…", "&hellip;", "Üç nöqtə; bir kod nöqtəsidir, ardıcıl üç nöqtədən fərqlidir və axtarışda uyğun gəlmir.", ["uc noqte", "ellipsis"]],
  ["«", "&laquo;", "Açılan quşdimdik dırnaq; Azərbaycan mətnində sitat və ad üçün standart açılış işarəsidir.", ["dirnaq", "sitat"]],
  ["»", "&raquo;", "Bağlanan quşdimdik dırnaq; açılan cütü ilə birlikdə sitatı bağlayır.", ["dirnaq", "sitat"]],
  ["“", "&ldquo;", "Açılan əyri cüt dırnaq; ingilis mətnində standartdır, kodda isə sətri bağlamır.", ["dirnaq", "smart quote"]],
  ["”", "&rdquo;", "Bağlanan əyri cüt dırnaq; JSON-a düşəndə parser dərhal xəta verir.", ["dirnaq", "smart quote"]],
  ["‘", "&lsquo;", "Açılan əyri tək dırnaq; düz apostrofla eyni görünmür, amma tez-tez onunla qarışdırılır.", ["dirnaq", "apostrof"]],
  ["’", "&rsquo;", "Bağlanan əyri tək dırnaq; apostrof kimi də işlənir və düz apostrofdan fərqli koddur.", ["dirnaq", "apostrof"]],
  ["€", "&euro;", "Avro işarəsi; UTF-8-də üç bayt tutur və latın-1 kodlamasında ümumiyyətlə yoxdur.", ["avro", "euro", "valyuta"]],
  ["₼", "&#8380;", "Azərbaycan manatı; adlı HTML entity-si yoxdur, yalnız rəqəmli formada yazılır.", ["manat", "valyuta"]],
  ["©", "&copy;", "Müəllif hüququ işarəsi; alt yazıda (c) əvəzinə bu simvol işlədilməlidir.", ["muellif", "copyright"]],
  ["®", "&reg;", "Qeydiyyatdan keçmiş ticarət nişanı; yalnız rəsmi qeydiyyat olanda yazılır.", ["ticaret nisani", "registered"]],
  ["™", "&trade;", "Ticarət nişanı işarəsi; qeydiyyat tələb etmir və üstdə kiçik yazılır.", ["ticaret nisani", "trademark"]],
  ["°", "&deg;", "Dərəcə işarəsi; temperatur və bucaq üçündür, kiçik o hərfi ilə əvəz edilmir.", ["derece", "degree"]],
  ["±", "&plusmn;", "Plus-minus; ölçmə xətasını bildirir, məsələn 3,5 ± 0,2 yazılışında.", ["plus minus", "xeta"]],
  ["×", "&times;", "Vurma işarəsi; ölçü yazılışında x hərfinin yerinə bu işarə düzgündür.", ["vurma", "olcu"]],
  ["÷", "&divide;", "Bölmə işarəsi; riyazi mətndə slash əvəzinə işlədilir.", ["bolme", "divide"]],
  ["→", "&rarr;", "Sağa ox; addım ardıcıllığı və çevrilmə göstərmək üçün işlənir.", ["ox", "arrow", "saga"]],
  ["←", "&larr;", "Sola ox; geri qayıdışı və əks istiqaməti göstərir.", ["ox", "arrow", "sola"]],
  ["↑", "&uarr;", "Yuxarı ox; artımı və yuxarı istiqaməti bildirmək üçün işlənir.", ["ox", "arrow", "yuxari"]],
  ["↓", "&darr;", "Aşağı ox; azalmanı və aşağı istiqaməti bildirmək üçün işlənir.", ["ox", "arrow", "asagi"]],
  ["✓", "&check;", "Onay işarəsi; siyahıda yerinə yetirilmiş bəndi göstərmək üçün işlənir.", ["onay", "check", "tik"]],
  ["✗", "&#10007;", "Rədd işarəsi; adlı entity-si yoxdur, rəqəmli formada yazılır.", ["redd", "cross"]],
  ["•", "&bull;", "Bullet; siyahı nöqtəsi kimi işlənir və nöqtədən daha iri çəkilir.", ["bullet", "siyahi"]],
  ["§", "&sect;", "Paraqraf işarəsi; hüquqi mətndə maddəyə istinad üçün işlənir.", ["paraqraf", "section"]],
  ["¶", "&para;", "Abzas işarəsi; redaktorlarda gizli formatı göstərəndə görünür.", ["abzas", "pilcrow"]],
  ["№", "&numero;", "Nömrə işarəsi; No qısaltmasının tək kod nöqtəsi ilə yazılmış formasıdır.", ["nomre", "numero"]],
  ["‰", "&permil;", "Promil; mində bir hissəni bildirir, faizdən on dəfə kiçik vahiddir.", ["promil", "permille"]],
  ["µ", "&micro;", "Mikro prefiksi; yunan mü hərfindən ayrı kod nöqtəsidir və onunla qarışdırılır.", ["mikro", "micro"]],
];

const signRows: ReferenceRow[] = SIGN_NOTES.map(([char, entity, note, match]) =>
  charRow(char, "isare", note, { example: entity, match }),
);

/*
 * The flagged characters, minus the ones the signs section already carries.
 *
 * Smart quotes and the two long dashes are flagged by the inspector because a
 * person reading them sees an apostrophe and a hyphen, but as reference rows
 * they belong under the signs somebody goes looking for on purpose — listing
 * them in both places would be the same row printed twice with two different
 * notes, which is how a lookup table starts contradicting itself.
 */
const SIGN_CHARS = new Set(SIGN_NOTES.map(([char]) => char));

const invisibleRows: ReferenceRow[] = FLAGGED.filter(
  ([codePoint]) => !SIGN_CHARS.has(String.fromCodePoint(codePoint)),
).map(([codePoint, flagged]) =>
  charRow(String.fromCodePoint(codePoint), "gorunmez", flagged.note, {
    display: flagged.abbr ?? String.fromCodePoint(codePoint),
    match: [flagged.name, flagged.abbr ?? "", flagged.blank ? "gorunmez" : "casdiran"],
  }),
);

export const asciiUnicodeRows: ReferenceRow[] = [
  ...controlRows,
  ...asciiRows,
  ...azRows,
  ...invisibleRows,
  ...signRows,
];
