/**
 * Groups a pasted keyword list into topic clusters by the stemmed word its
 * members share most, and turns the result back into a CSV a visitor can
 * take into a spreadsheet.
 *
 * `tokenize` and the stopword set come from `acar-soz-sixligi.ts` rather
 * than being rebuilt here — one tokenizer for both keyword tools, so a fix
 * to how apostrophes or capital-I case folding are handled lands in both at
 * once instead of drifting apart.
 */
import { azLowerCase, DENSITY_STOPWORDS, tokenize } from "./acar-soz-sixligi";

/*
 * A conservative Azerbaijani suffix stripper, not a real morphological
 * analyser: it only ever removes the six suffix families named in this
 * tool's brief — plural, the two genitive/possessive-of families, locative
 * and ablative — and only when at least three letters remain, so a short
 * root such as a two-letter word is never touched at all. Longer suffixes
 * are tried before shorter ones on every pass, because Azerbaijani case
 * endings stack (plural then case), and stripping the outer one first is
 * what lets the inner one be found on the next pass.
 */
const SUFFIXES = [
  "lar", "lər",
  "nın", "nin", "nun", "nün",
  "dan", "dən",
  "da", "də",
  "ın", "in", "un", "ün",
  "ı", "i", "u", "ü",
];

const MIN_STEM_LENGTH = 3;

export function stemAz(word: string): string {
  let stem = azLowerCase(word);
  let strippedSomething = true;

  while (strippedSomething) {
    strippedSomething = false;
    for (const suffix of SUFFIXES) {
      if (stem.endsWith(suffix) && stem.length - suffix.length >= MIN_STEM_LENGTH) {
        stem = stem.slice(0, stem.length - suffix.length);
        strippedSomething = true;
        break;
      }
    }
  }

  return stem;
}

export type KeywordInput = { keyword: string; volume: number | null };

/** A paste this long is almost certainly a mistake, and grouping it in the browser on every keystroke would freeze the tab well before it got there. */
const MAX_KEYWORDS = 500;

/**
 * One keyword per line, with an optional second column — a tab if the list
 * came from a spreadsheet, otherwise a comma — holding a search-volume
 * number. A line with no second column, or one whose second column is not a
 * number, keeps its keyword and reports `volume: null` rather than being
 * dropped: a keyword list without volume data is still a keyword list.
 */
export function parseKeywordList(text: string): { items: KeywordInput[]; error: string | null } {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

  const items: KeywordInput[] = [];
  for (const line of lines) {
    const tabIndex = line.indexOf("\t");
    const commaIndex = line.indexOf(",");
    const splitAt = tabIndex !== -1 ? tabIndex : commaIndex;

    if (splitAt === -1) {
      items.push({ keyword: line, volume: null });
      continue;
    }

    const keyword = line.slice(0, splitAt).trim();
    const rest = line.slice(splitAt + 1).trim();
    if (keyword === "") continue;

    const digitsOnly = rest.replace(/[^\d.-]/g, "");
    const parsed = digitsOnly === "" ? Number.NaN : Number(digitsOnly);
    items.push({ keyword, volume: Number.isFinite(parsed) ? Math.round(parsed) : null });
  }

  if (items.length > MAX_KEYWORDS) {
    return {
      items: items.slice(0, MAX_KEYWORDS),
      error: `${items.length} açar söz yapışdırıldı, yalnız ilk ${MAX_KEYWORDS} işləndi.`,
    };
  }

  return { items, error: null };
}

export type Cluster = { head: string; sharedToken: string; items: KeywordInput[]; weight: number };

/** Non-stopword, letter-bearing stems for one keyword — a shared number is never a meaningful grouping reason, so a purely numeric token is left out. */
function coreStems(keyword: string): string[] {
  const stems = tokenize(keyword)
    .filter((token) => !DENSITY_STOPWORDS.has(token) && /\p{L}/u.test(token))
    .map((token) => stemAz(token));
  return Array.from(new Set(stems));
}

/** The keyword the group is named after: the highest-volume member when any member carries volume data, otherwise the shortest keyword — the most generic phrase in the group. */
function pickHead(items: KeywordInput[]): string {
  const withVolume = items.filter((item): item is { keyword: string; volume: number } => item.volume !== null);
  if (withVolume.length > 0) {
    return withVolume.reduce((best, item) => (item.volume > best.volume ? item : best)).keyword;
  }
  return items.reduce((shortest, item) => (item.keyword.length < shortest.keyword.length ? item : shortest)).keyword;
}

/**
 * Groups keywords by the single stemmed word each one shares with the most
 * other keywords in the list — a deliberately simple rule, chosen so the
 * page can tell a visitor exactly why a keyword landed where it did ("this
 * group's members all share the stem X, and X is this keyword's most common
 * word across the whole list"), rather than asking them to trust a score
 * they cannot see the working for.
 *
 * Each keyword is scored against every stem it contains (after the stopword
 * filter) by how many other keywords in the list also contain that stem; it
 * joins the bucket for its highest-scoring stem, with ties broken by
 * left-to-right order in the keyword itself so the choice is reproducible
 * from the keyword text alone. A bucket that stays under `opts.minSize`
 * never becomes a cluster — its members are handed back as `orphans`
 * instead, which is also where a keyword with no letter-bearing stem at all
 * ends up.
 *
 * A cluster's `weight` is the sum of its members' search volume when at
 * least one member carries one, so clusters sort by real demand; a list
 * with no volume column at all falls back to member count, which keeps the
 * sort meaningful rather than tying every cluster at zero.
 */
export function clusterKeywords(
  items: KeywordInput[],
  opts: { minSize: number },
): { clusters: Cluster[]; orphans: KeywordInput[] } {
  const withStems = items.map((item) => ({ item, stems: coreStems(item.keyword) }));

  const documentFrequency = new Map<string, number>();
  for (const { stems } of withStems) {
    for (const stem of stems) {
      documentFrequency.set(stem, (documentFrequency.get(stem) ?? 0) + 1);
    }
  }

  const buckets = new Map<string, KeywordInput[]>();
  const bucketOrder: string[] = [];
  const orphans: KeywordInput[] = [];

  for (const { item, stems } of withStems) {
    if (stems.length === 0) {
      orphans.push(item);
      continue;
    }

    let bestStem = stems[0]!;
    let bestScore = documentFrequency.get(bestStem) ?? 0;
    for (const stem of stems.slice(1)) {
      const score = documentFrequency.get(stem) ?? 0;
      if (score > bestScore) {
        bestStem = stem;
        bestScore = score;
      }
    }

    if (!buckets.has(bestStem)) {
      buckets.set(bestStem, []);
      bucketOrder.push(bestStem);
    }
    buckets.get(bestStem)!.push(item);
  }

  const clusters: Cluster[] = [];
  for (const stem of bucketOrder) {
    const bucketItems = buckets.get(stem)!;
    if (bucketItems.length < opts.minSize) {
      orphans.push(...bucketItems);
      continue;
    }

    const anyVolume = bucketItems.some((item) => item.volume !== null);
    const weight = anyVolume
      ? bucketItems.reduce((sum, item) => sum + (item.volume ?? 0), 0)
      : bucketItems.length;

    clusters.push({ head: pickHead(bucketItems), sharedToken: stem, items: bucketItems, weight });
  }

  clusters.sort((a, b) => b.weight - a.weight);

  return { clusters, orphans };
}

/** Anything with a separator or a quote in it has to be quoted, and a quote inside doubles — the same rule every CSV writer in this codebase uses. */
function csvCell(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

const ORPHAN_GROUP_LABEL = "tək qalanlar";

export function clustersToCsv(clusters: Cluster[], orphans: KeywordInput[]): string {
  const lines = ["qrup,acar_soz,hecm"];

  for (const cluster of clusters) {
    for (const item of cluster.items) {
      lines.push(
        [csvCell(cluster.head), csvCell(item.keyword), item.volume === null ? "" : String(item.volume)].join(","),
      );
    }
  }

  for (const item of orphans) {
    lines.push(
      [csvCell(ORPHAN_GROUP_LABEL), csvCell(item.keyword), item.volume === null ? "" : String(item.volume)].join(","),
    );
  }

  return lines.join("\r\n");
}
