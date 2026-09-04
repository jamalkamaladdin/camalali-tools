/*
 * chmod: one permission mode, written three ways.
 *
 * A visitor arrives holding exactly one of the three — the number a tutorial
 * told them to type, the `rwxr-xr-x` their terminal printed, or nothing but
 * the sentence "the owner should be able to run it". The tool's whole claim is
 * that those are the same fact, so the fact is a single value here and every
 * representation is a pure function of it. A calculator that keeps three text
 * fields in sync with each other is a calculator that eventually disagrees
 * with itself; this one has one mode and three renderers.
 *
 * React-free on purpose: the check file drives everything below without a DOM.
 */
import type { ReferenceRow, ReferenceSection } from "./reference";

/* The octal weights, named. They are the only numbers in this file that are
   not somebody's file mode. */
const READ = 4;
const WRITE = 2;
const EXECUTE = 1;

const SETUID = 4;
const SETGID = 2;
const STICKY = 1;

/** How many octal digits a mode has once the special bits are counted. */
const MODE_DIGITS = 4;
/** `rwxrwxrwx` — three triads of three. */
const SYMBOLIC_LENGTH = 9;

export type Permission = { read: boolean; write: boolean; execute: boolean };

export type ChmodMode = {
  owner: Permission;
  group: Permission;
  other: Permission;
  /** Runs as the file's owner rather than as whoever started it. */
  setuid: boolean;
  /** Runs as the file's group; on a directory, new files inherit that group. */
  setgid: boolean;
  /** On a directory: anyone may write, only the owner of a file may delete it. */
  sticky: boolean;
};

/*
 * Written out rather than built from one shared `Permission` literal: three
 * fields pointing at the same object is a mutation away from a mode where
 * ticking the owner's read box also ticks the group's.
 */
export const EMPTY_MODE: ChmodMode = {
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  other: { read: false, write: false, execute: false },
  setuid: false,
  setgid: false,
  sticky: false,
};

/* ---------- rendering ---------- */

function digitOf(permission: Permission): number {
  return (
    (permission.read ? READ : 0) +
    (permission.write ? WRITE : 0) +
    (permission.execute ? EXECUTE : 0)
  );
}

/** Always four digits, so the special bits are never silently dropped. */
export function toOctal(mode: ChmodMode): string {
  const special =
    (mode.setuid ? SETUID : 0) + (mode.setgid ? SETGID : 0) + (mode.sticky ? STICKY : 0);
  return `${special}${digitOf(mode.owner)}${digitOf(mode.group)}${digitOf(mode.other)}`;
}

/*
 * One triad of the `ls -l` string.
 *
 * The third character carries three facts at once: the execute bit, the
 * special bit belonging to this triad, and — through its case — whether the
 * special bit has an execute bit underneath it to act on. A capital `S` or `T`
 * is therefore the printed shape of a mistake, and worth understanding rather
 * than treating as decoration.
 */
function triad(permission: Permission, special: boolean, mark: "s" | "t"): string {
  const last = special
    ? permission.execute
      ? mark
      : mark.toUpperCase()
    : permission.execute
      ? "x"
      : "-";
  return `${permission.read ? "r" : "-"}${permission.write ? "w" : "-"}${last}`;
}

export function toSymbolic(mode: ChmodMode): string {
  return (
    triad(mode.owner, mode.setuid, "s") +
    triad(mode.group, mode.setgid, "s") +
    triad(mode.other, mode.sticky, "t")
  );
}

/* ---------- parsing ---------- */

function permissionOf(digit: number): Permission {
  return {
    read: (digit & READ) !== 0,
    write: (digit & WRITE) !== 0,
    execute: (digit & EXECUTE) !== 0,
  };
}

const OCTAL_PATTERN = /^[0-7]{1,4}$/;

/**
 * `755`, `0755` and `4755` — and also `75`, which is not a typo being let
 * through. `chmod 75 file` is a real command that sets 075: the shell tool
 * treats missing digits as leading zeros, and a calculator that rejected what
 * the command accepts would be teaching the wrong thing. Anything that is not
 * one to four octal digits comes back as `null` rather than as a guess.
 */
export function parseOctal(input: string): ChmodMode | null {
  const text = input.trim();
  if (!OCTAL_PATTERN.test(text)) return null;

  const digits = text.padStart(MODE_DIGITS, "0").split("").map(Number);
  const special = digits[0];
  return {
    owner: permissionOf(digits[1]),
    group: permissionOf(digits[2]),
    other: permissionOf(digits[3]),
    setuid: (special & SETUID) !== 0,
    setgid: (special & SETGID) !== 0,
    sticky: (special & STICKY) !== 0,
  };
}

/** The leading character `ls -l` prints: file, directory, symlink, socket… */
const FILE_TYPE_MARKS = "-dlbcps";

function parseTriad(
  text: string,
  mark: "s" | "t",
): { permission: Permission; special: boolean } | null {
  const read = text[0];
  const write = text[1];
  const last = text[2];

  if (read !== "r" && read !== "-") return null;
  if (write !== "w" && write !== "-") return null;

  const base = { read: read === "r", write: write === "w" };
  if (last === "x") return { permission: { ...base, execute: true }, special: false };
  if (last === "-") return { permission: { ...base, execute: false }, special: false };
  if (last === mark) return { permission: { ...base, execute: true }, special: true };
  if (last === mark.toUpperCase()) {
    return { permission: { ...base, execute: false }, special: true };
  }
  return null;
}

/**
 * `rwxr-xr-x`, `rwsr-sr-t`, and the ten-character line `ls -l` actually prints
 * — the leading file-type character is stripped rather than refused, because
 * pasting a line straight out of a terminal is how somebody arrives here.
 */
export function parseSymbolic(input: string): ChmodMode | null {
  let text = input.trim();
  if (text.length === SYMBOLIC_LENGTH + 1 && FILE_TYPE_MARKS.includes(text[0])) {
    text = text.slice(1);
  }
  if (text.length !== SYMBOLIC_LENGTH) return null;

  const owner = parseTriad(text.slice(0, 3), "s");
  const group = parseTriad(text.slice(3, 6), "s");
  const other = parseTriad(text.slice(6, 9), "t");
  if (owner === null || group === null || other === null) return null;

  return {
    owner: owner.permission,
    group: group.permission,
    other: other.permission,
    setuid: owner.special,
    setgid: group.special,
    sticky: other.special,
  };
}

/* ---------- explaining ---------- */

type ActorKey = "owner" | "group" | "other";

const ACTOR_ORDER: ActorKey[] = ["owner", "group", "other"];
const ACTOR_LABELS: Record<ActorKey, string> = {
  owner: "sahib",
  group: "qrup",
  other: "digərləri",
};

const VERBS: { key: keyof Permission; text: string }[] = [
  { key: "read", text: "oxuya" },
  { key: "write", text: "yaza" },
  { key: "execute", text: "icra edə" },
];

/** "oxuya, yaza və icra edə" — the last pair joined by a word, not a comma. */
function joinVerbs(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} və ${parts[parts.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toLocaleUpperCase("az") + text.slice(1);
}

/** The three actors, collapsed into runs that hold the same permissions. */
function groupActors(mode: ChmodMode): { actors: ActorKey[]; permission: Permission }[] {
  const groups: { actors: ActorKey[]; permission: Permission }[] = [];

  for (const actor of ACTOR_ORDER) {
    const permission = mode[actor];
    const last = groups[groups.length - 1];
    if (last !== undefined && digitOf(last.permission) === digitOf(permission)) {
      last.actors.push(actor);
      continue;
    }
    groups.push({ actors: [actor], permission });
  }

  return groups;
}

function subjectOf(actors: ActorKey[]): string {
  if (actors.length === ACTOR_ORDER.length) return "hamı";
  return actors.map((actor) => ACTOR_LABELS[actor]).join(" və ");
}

/**
 * The mode as one Azerbaijani sentence.
 *
 * The grouping is what makes it readable: 755 said actor by actor is three
 * clauses that repeat themselves, and said as "owner … ; group and others
 * only …" it is the sentence a person would say out loud. "yalnız" is added
 * only where a later group really holds less than the first one, so it stays a
 * comparison rather than a verbal tic.
 */
export function describeMode(mode: ChmodMode): string {
  const groups = groupActors(mode);
  const first = groups[0];
  const clauses = groups.map((group, index) => {
    const subject = index === 0 ? capitalise(subjectOf(group.actors)) : subjectOf(group.actors);
    const verbs = VERBS.filter((verb) => group.permission[verb.key]).map((verb) => verb.text);
    if (verbs.length === 0) return `${subject} heç nə edə bilmir`;

    const narrower = index > 0 && verbs.length < digitCount(first.permission);
    return `${subject} ${narrower ? "yalnız " : ""}${joinVerbs(verbs)} bilər`;
  });

  const sentences = [`${clauses.join("; ")}.`];
  if (mode.setuid) {
    sentences.push(
      "Setuid qoyulub — fayl kimin işlətməsindən asılı olmayaraq sahibinin icazələri ilə işləyir.",
    );
  }
  if (mode.setgid) {
    sentences.push(
      "Setgid qoyulub — qovluqda yaradılan yeni fayllar qrupu qovluqdan miras alır.",
    );
  }
  if (mode.sticky) {
    sentences.push("Sticky bit qoyulub — qovluqdakı faylı yalnız onun sahibi silə bilər.");
  }

  return sentences.join(" ");
}

/** How many of the three bits a permission holds. */
function digitCount(permission: Permission): number {
  return VERBS.filter((verb) => permission[verb.key]).length;
}

/* ---------- warnings ---------- */

function isFull(permission: Permission): boolean {
  return permission.read && permission.write && permission.execute;
}

function isReadWrite(permission: Permission): boolean {
  return permission.read && permission.write && !permission.execute;
}

/**
 * What is worth interrupting somebody over, and nothing else.
 *
 * The directory trap — `r` without `x` gets you a list of names you cannot
 * open — is deliberately not in here even though it is the single most common
 * confusion. It would fire on 644, which is the correct mode for almost every
 * file on a server, and a warning that shouts at the right answer is a warning
 * people learn to scroll past. The tool raises that one beside the grid, as a
 * note about directories, where it is a fact rather than an accusation.
 */
export function modeWarnings(mode: ChmodMode): string[] {
  const warnings: string[] = [];

  if (isFull(mode.owner) && isFull(mode.group) && isFull(mode.other)) {
    warnings.push(
      "777 — sistemdəki hər istifadəçi bu faylı oxuya, dəyişə və icra edə bilər. Veb serverdə bu, demək olar həmişə səhvdir: sayta düşən istənilən skript faylın içinə öz kodunu yaza bilər.",
    );
  } else if (isReadWrite(mode.owner) && isReadWrite(mode.group) && isReadWrite(mode.other)) {
    warnings.push(
      "666 — icra bayrağı yoxdur, amma faylın məzmununu sistemdəki hər istifadəçi əvəz edə bilər. Konfiqurasiya faylında bu, 777-dən az təhlükəli deyil.",
    );
  } else if (mode.other.write) {
    warnings.push(
      "Digərlərinə yazma icazəsi verilib (o+w) — faylı sistemdəki hər istifadəçi dəyişə bilər. Adətən düzgün qrup və g+w kifayət edir.",
    );
  }

  if (mode.setuid && mode.other.write) {
    warnings.push(
      "Setuid ilə birlikdə digərlərinə yazma icazəsi verilib — hər istifadəçi faylın içini əvəz edib onu sahibin, çox vaxt root-un adı ilə icra etdirə bilər.",
    );
  }

  if (mode.setuid && !mode.owner.execute) {
    warnings.push(
      "Setuid qoyulub, amma sahib üçün icra bayrağı yoxdur — bit heç nə etmir. ls bunu kiçik s yerinə böyük S kimi göstərir.",
    );
  }

  return warnings;
}

/* ---------- the command ---------- */

/*
 * Characters a POSIX shell hands through untouched. A path is normally all of
 * them; a file name with a space in it is not, and printing an unquoted one
 * would be a copy-paste that silently chmods the wrong thing.
 */
const SHELL_SAFE = /^[A-Za-z0-9._\-/~@+:]+$/;

/**
 * The line to copy. Four digits only when a special bit is actually set —
 * `chmod 755 deploy.sh` is what a person types and what every guide prints,
 * and a leading zero on it reads as a typo rather than as precision.
 */
export function chmodCommand(mode: ChmodMode, target: string): string {
  const octal = toOctal(mode);
  const digits = octal.startsWith("0") ? octal.slice(1) : octal;
  const name = target.trim() === "" ? "fayl" : target.trim();
  const quoted = SHELL_SAFE.test(name) ? name : `'${name.replaceAll("'", `'\\''`)}'`;
  return `chmod ${digits} ${quoted}`;
}

/* ---------- reference ---------- */

export const chmodSections: ReferenceSection[] = [
  {
    id: "adi",
    label: "Ən çox işlənən",
    hint: "Gündəlik işdə qarşına çıxan fayl rejimləri.",
  },
  {
    id: "qovluq",
    label: "Qovluqlar",
    hint: "Qovluqda eyni bitlər fayldakından fərqli məna daşıyır.",
  },
  {
    id: "xususi",
    label: "Xüsusi bitlər",
    hint: "Dördüncü rəqəm: setuid, setgid və sticky bit.",
  },
  {
    id: "simvolik",
    label: "Simvolik yazılış",
    hint: "Rəqəm əvəzinə hərflə: kim, hansı əməliyyat, hansı icazə.",
  },
  {
    id: "tele",
    label: "Tələlər",
    hint: "Ən çox rast gəlinən səhvlər və chmod-un həll etmədiyi hallar.",
  },
];

export const chmodRows: ReferenceRow[] = [
  /* ---- ən çox işlənən ---- */
  {
    term: "644",
    label: "rw-r--r--",
    section: "adi",
    note: "Adi fayl üçün standart: sahib oxuyur və yazır, qalan hamı yalnız oxuyur. HTML, şəkil, sənəd və çoxu konfiqurasiya faylı üçün doğru seçim.",
    example: "chmod 644 index.html",
    match: ["adi fayl", "default", "sened"],
  },
  {
    term: "755",
    label: "rwxr-xr-x",
    section: "adi",
    note: "Skript, proqram və qovluq üçün standart: sahib hər şeyi edir, qalanlar oxuyur və icra edir. Veb kökündəki qovluqlar adətən belə olur.",
    example: "chmod 755 deploy.sh",
    match: ["skript", "executable", "icra"],
  },
  {
    term: "600",
    label: "rw-------",
    section: "adi",
    note: "Yalnız sahib oxuyur və yazır, başqa heç kim faylı aça bilmir. Parol, token və gizli açar saxlayan fayllar üçün.",
    example: "chmod 600 .env",
    match: ["gizli", "secret", "env"],
  },
  {
    term: "640",
    label: "rw-r-----",
    section: "adi",
    note: "Sahib yazır, qrup oxuyur, digərləri ümumiyyətlə görmür. Veb serverin qrupu ilə paylaşılan konfiqurasiya faylı üçün tipik seçim.",
    example: "chmod 640 app.conf",
  },
  {
    term: "664",
    label: "rw-rw-r--",
    section: "adi",
    note: "Sahib və qrup birlikdə yazır, digərləri oxuyur. Bir neçə nəfərin eyni faylı redaktə etdiyi paylaşılan qovluqda işlənir.",
    example: "chmod 664 hesabat.csv",
  },
  {
    term: "775",
    label: "rwxrwxr-x",
    section: "adi",
    note: "664-ün icra bayraqlı variantı: qrup həm yazır, həm icra edir. Komanda ilə birgə işlədilən qovluq və skriptlər üçün.",
    example: "chmod 775 /srv/komanda",
  },
  {
    term: "700",
    label: "rwx------",
    section: "adi",
    note: "Yalnız sahib: oxuyur, yazır, icra edir. Şəxsi skript və şəxsi qovluq üçün: başqa istifadəçi içəri girə bilmir.",
    example: "chmod 700 yedekle.sh",
  },
  {
    term: "750",
    label: "rwxr-x---",
    section: "adi",
    note: "Sahib hər şeyi edir, qrup oxuyur və icra edir, digərləri heç nə. Xidmətin öz qrupuna verilən proqram qovluğu üçün.",
    example: "chmod 750 /opt/xidmet",
  },
  {
    term: "444",
    label: "r--r--r--",
    section: "adi",
    note: "Hamıya yalnız oxu (sahibə də). Səhvən dəyişilməsin deyə dondurulan fayl üçün; yazmaq lazım olanda əvvəlcə rejimi geri qaytarmaq gərəkir.",
    example: "chmod 444 lisenziya.txt",
  },
  {
    term: "400",
    label: "r--------",
    section: "adi",
    note: "Yalnız sahib oxuyur, heç kim yazmır. Bir dəfə yazılıb bir daha dəyişməyəcək gizli fayl (məsələn, buluddan endirilən açar).",
    example: "chmod 400 acar.pem",
  },
  {
    term: "500",
    label: "r-x------",
    section: "adi",
    note: "Sahib oxuyur və icra edir, amma yaza bilmir. Təsadüfən redaktə olunmasın deyə qorunan şəxsi skript üçün.",
    example: "chmod 500 buraxilis.sh",
  },

  /* ---- qovluqlar ---- */
  {
    term: "711",
    label: "rwx--x--x",
    section: "qovluq",
    note: "Qovluğa girmək olar, içindəkilərin siyahısını görmək olmaz. Yolu bilən konkret fayla çatır, ls isə boş qayıdır, çox istifadəçili serverdə ev qovluğu üçün işlənir.",
    example: "chmod 711 /home/camal",
  },
  {
    term: "~/.ssh",
    label: "700 tələb olunur",
    section: "qovluq",
    note: "Qovluq başqa istifadəçilərə açıq olsa, ssh oradakı açarları oxumaqdan imtina edir. Qovluq 700, içindəki gizli açar isə 600 olmalıdır.",
    example: "chmod 700 ~/.ssh",
    match: ["ssh", "acar", "key"],
  },
  {
    term: "/var/www",
    label: "veb kök",
    section: "qovluq",
    note: "Veb kökündə qovluqlara 755, fayllara 644 verilir: server oxuya bilir, kənar istifadəçi yaza bilmir. Yükləmə qovluğu istisna olaraq qrupa yazma icazəsi alır.",
    example: "find /var/www -type d -exec chmod 755 {} +",
    match: ["nginx", "apache", "web root"],
  },
  {
    term: "-R",
    label: "rekursiv",
    section: "qovluq",
    note: "Qovluğu və içindəki hər şeyi bir əmrlə dəyişir. Fayl ilə qovluğa eyni rəqəmi vermək demək olduğu üçün diqqət istəyir: chmod -R 755 bütün sənədləri icra edilə bilən edir.",
    example: "chmod -R u+rwX,go+rX,go-w /srv/sayt",
    match: ["recursive", "butun fayllar"],
  },
  {
    term: "find -type d",
    label: "ayrı-ayrı rejim",
    section: "qovluq",
    note: "Qovluqlara və fayllara fərqli rejim vermək üçün düzgün üsul: əvvəlcə yalnız qovluqlar seçilir, sonra ayrıca yalnız fayllar.",
    example: "find . -type f -exec chmod 644 {} +",
  },

  /* ---- xüsusi bitlər ---- */
  {
    term: "4755",
    label: "rwsr-xr-x",
    section: "xususi",
    note: "Setuid: proqram onu işə salanın yox, faylın sahibinin icazələri ilə işləyir. passwd məhz belə işləyir; kodunu özün yazmadığın faylda bu biti qoymaq təhlükəlidir.",
    example: "ls -l /usr/bin/passwd",
    match: ["setuid", "4000", "suid"],
  },
  {
    term: "2775",
    label: "rwxrwsr-x",
    section: "xususi",
    note: "Setgid qovluq: içində yaradılan hər yeni fayl qovluğun qrupunu miras alır. «Yeni fayl yenə səhv qrupa düşdü» probleminin həlli budur.",
    example: "chmod 2775 /srv/paylasilan",
    match: ["setgid", "2000", "qrup mirasi"],
  },
  {
    term: "1777",
    label: "rwxrwxrwt",
    section: "xususi",
    note: "Sticky bit: qovluğa hamı yaza bilir, amma faylı yalnız onun sahibi silə bilər. /tmp qovluğu məhz bu rejimdədir.",
    example: "ls -ld /tmp",
    match: ["sticky", "tmp", "1000"],
  },
  {
    term: "0777",
    label: "üç yoxsa dörd rəqəm",
    section: "xususi",
    note: "Buraxılan rəqəm baş sıfır sayılır: faylda chmod 755 ilə chmod 0755 eynidir və hər ikisi setuid/setgid bitini silir. İstisna qovluqdur: GNU chmod açıq yazmasan qovluğun setgid bitini saxlayır.",
    example: "chmod 2775 /srv/paylasilan",
    match: ["0644", "bas sifir", "dord reqem"],
  },
  {
    term: "s və S",
    label: "kiçik və böyük hərf",
    section: "xususi",
    note: "rwsr-xr-x-dəki kiçik s həm xüsusi bitin, həm də icra bayrağının olduğunu bildirir. Böyük S (sticky-də böyük T) altında icra bayrağı olmayan xüsusi bit deməkdir: bit qoyulub, amma heç nə etmir.",
    example: "chmod 4644 fayl.txt",
    match: ["boyuk S", "boyuk T", "rwS"],
  },

  /* ---- simvolik ---- */
  {
    term: "u g o a",
    label: "kim",
    section: "simvolik",
    note: "u sahib, g qrup, o digərləri, a hamısı. Hərf yazılmasa umask nəzərə alınır, ona görə kimi nəzərdə tutduğunu açıq yazmaq daha etibarlıdır.",
    example: "chmod ug+w notlar.txt",
    match: ["user group other all"],
  },
  {
    term: "u+x",
    label: "icra əlavə et",
    section: "simvolik",
    note: "Sahibə icra icazəsi verir, qalan bitlərə toxunmur. Yeni endirilmiş skripti işə salmaq üçün ən çox yazılan əmr budur.",
    example: "chmod u+x setup.sh",
  },
  {
    term: "g-w",
    label: "icazəni al",
    section: "simvolik",
    note: "Qrupdan yazma icazəsini götürür. Rəqəmlə yazsan bütün rejimi yenidən təyin etməli olursan, g-w isə yalnız bir biti dəyişir.",
    example: "chmod g-w app.conf",
  },
  {
    term: "o=r",
    label: "təyin et",
    section: "simvolik",
    note: "Bərabərlik işarəsi əlavə etmir, təyin edir: digərlərinin bütün icazələri silinir və yerində yalnız oxu qalır. o= isə hamısını silir.",
    example: "chmod o=r hesabat.pdf",
  },
  {
    term: "a+r",
    label: "hamıya oxu",
    section: "simvolik",
    note: "Sahib, qrup və digərləri: üçünə də oxu icazəsi verir. Veb serverin faylı görməsi üçün ən qısa yol budur.",
    example: "chmod a+r logo.svg",
  },
  {
    term: "+X",
    label: "yalnız qovluqlara icra",
    section: "simvolik",
    note: "Böyük X icra bayrağını yalnız qovluqlara və artıq kimsə üçün icra bayrağı olan fayllara verir. Rekursiv əmrdə sənədləri icra edilə bilən etməmək üçün istifadə olunur.",
    example: "chmod -R a+rX /srv/sayt",
    match: ["boyuk X", "rekursiv icra"],
  },
  {
    term: "u+s",
    label: "xüsusi bitlər hərflə",
    section: "simvolik",
    note: "Setuid bitini rəqəm yazmadan qoyur; g+s setgid, +t isə sticky bit üçündür. Silmək üçün eyni hərf mənfi ilə yazılır: u-s.",
    example: "chmod g+s /srv/paylasilan",
    match: ["g+s", "+t"],
  },
  {
    term: "--reference",
    label: "başqa fayldan kopyala",
    section: "simvolik",
    note: "Hədəf faylın rejimini nümunə faylınkı ilə eyniləşdirir. Düzgün rejim bir faylda hazırdırsa, rəqəmi əl ilə oxumağa ehtiyac qalmır.",
    example: "chmod --reference=index.html haqqinda.html",
  },

  /* ---- tələlər ---- */
  {
    term: "777",
    label: "rwxrwxrwx",
    section: "tele",
    note: "Sistemdəki hər istifadəçi faylı oxuya, dəyişə və icra edə bilər. Veb serverdə bu, demək olar həmişə səhvdir; düzgün həll sahibi və qrupu qaydasına salmaqdır.",
    example: "chown deploy:www-data fayl && chmod 644 fayl",
    match: ["hamiya icaze", "tehlukesizlik"],
  },
  {
    term: "666",
    label: "rw-rw-rw-",
    section: "tele",
    note: "İcra bayrağı yoxdur, amma məzmunu hər kəs əvəz edə bilər. Konfiqurasiya və verilənlər faylında bu, 777-dən az təhlükəli deyil.",
    example: "chmod 644 config.json",
  },
  {
    term: "600 (SSH açarı)",
    label: "gizli açar",
    section: "tele",
    note: "SSH gizli açarı 600-dən geniş rejimdə olsa, ssh onu oxumur və UNPROTECTED PRIVATE KEY FILE xətası verir. Açar 600, qovluq isə 700 olmalıdır.",
    example: "chmod 600 ~/.ssh/id_ed25519",
    match: ["ssh", "unprotected private key", "permission denied"],
  },
  {
    term: "chmod 644 qovluq",
    label: "qovluqda x yoxdur",
    section: "tele",
    note: "Qovluqda r yalnız adları oxumağa icazə verir; içindəki fayla toxunmaq və cd etmək üçün x lazımdır. icra bayrağı olmayan qovluq siyahını göstərir, amma heç bir faylı açmır. Ən çox rast gəlinən çaşqınlıq budur.",
    example: "chmod 755 qovluq",
    match: ["cd permission denied", "qovluga girmek"],
  },
  {
    term: "chmod -R 777",
    label: "işləmirsə 777 ver",
    section: "tele",
    note: "İcazə xətasını 777 ilə «düzəltmək» səbəbi gizlədir və serverdə açıq qapı qoyur. Əvvəlcə faylın sahibinə bax: çox vaxt lazım olan chown-dur, chmod deyil.",
    example: "chown -R deploy:www-data /srv/sayt",
  },
  {
    term: "umask 022",
    label: "yeni faylın rejimi",
    section: "tele",
    note: "Yeni fayl 666-dan, yeni qovluq 777-dən umask çıxılmaqla yaranır: 022-də bu, 644 və 755 deməkdir. Ona görə yeni fayl heç vaxt icra bayrağı ilə doğulmur.",
    example: "umask 022 && touch yeni.txt",
    match: ["default icaze", "yeni fayl"],
  },
  {
    term: "umask 077",
    label: "şəxsi default",
    section: "tele",
    note: "Yaradılan fayl 600, qovluq 700 olur: yalnız sahib görür. Paylaşılan serverdə şəxsi sessiya üçün işlənir.",
    example: "umask 077",
  },
  {
    term: "chown",
    label: "sahibi dəyişir",
    section: "tele",
    note: "chmod yalnız bitləri dəyişir, faylın kimə aid olduğunu yox. Fayl səhv istifadəçiyə aiddirsə rejimlə oynamaq kömək etmir: sahibi dəyişmək lazımdır, bunun üçün isə root icazəsi tələb olunur.",
    example: "chown deploy:www-data app.conf",
  },
  {
    term: "chgrp",
    label: "qrupu dəyişir",
    section: "tele",
    note: "Yalnız qrupu dəyişir və faylın sahibi tərəfindən işlədilə bilir. Veb serverin faylı oxuması üçün çox vaxt 664 verməkdən daha doğru həll budur: qrupu www-data etmək.",
    example: "chgrp www-data app.conf",
  },
];
