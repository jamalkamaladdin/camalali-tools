/*
 * What a wrong edit here would break silently: an entry landing at the wrong
 * path, an array mode picking the wrong matched pair, `orderSensitive`
 * failing to change position-mode output, or a JSON Patch that looks right
 * but does not actually reconstruct the second document when applied to the
 * first — the property the whole "Patch" half of the tool exists to deliver.
 */
import type { CheckSuite } from "./harness.mts";
import { applyJsonPatch, diffJson, parseJsonSafe, toJsonPatch, type DiffOptions, type JsonValue } from "../lib/json-ferq";

const INDEX_MODE: DiffOptions = { arrayMode: "index", arrayKey: "id", orderSensitive: true };
const KEY_MODE: DiffOptions = { arrayMode: "key", arrayKey: "id", orderSensitive: true };
const INDEX_MODE_ORDER_FREE: DiffOptions = { arrayMode: "index", arrayKey: "id", orderSensitive: false };

export const checks: CheckSuite = (check) => {
  const replaced = diffJson({ name: "Ali" }, { name: "Vali" }, INDEX_MODE);
  check(
    "json-ferq: sadə dəyər dəyişikliyi replace kimi düzgün yolda",
    replaced.length === 1 && replaced[0].path === "name" && replaced[0].op === "replace" && replaced[0].after === "Vali",
    `alındı: ${JSON.stringify(replaced)}`,
  );

  const added = diffJson({ a: 1 }, { a: 1, b: 2 }, INDEX_MODE);
  check(
    "json-ferq: yeni açar add kimi çıxır",
    added.length === 1 && added[0].op === "add" && added[0].path === "b" && added[0].pointer === "/b",
    `alındı: ${JSON.stringify(added)}`,
  );

  const removed = diffJson({ a: 1, b: 2 }, { a: 1 }, INDEX_MODE);
  check(
    "json-ferq: silinən açar remove kimi çıxır",
    removed.length === 1 && removed[0].op === "remove" && removed[0].before === 2,
    `alındı: ${JSON.stringify(removed)}`,
  );

  const typeChanged = diffJson({ a: "1" }, { a: 1 }, INDEX_MODE);
  check(
    "json-ferq: string-dən number-ə keçid type-change sayılır, replace yox",
    typeChanged.length === 1 && typeChanged[0].op === "type-change",
    `alındı: ${JSON.stringify(typeChanged)}`,
  );

  const nested = diffJson({ user: { address: { city: "Bakı" } } }, { user: { address: { city: "Gəncə" } } }, INDEX_MODE);
  check(
    "json-ferq: nested yol nöqtə ilə düzgün qurulur",
    nested.length === 1 && nested[0].path === "user.address.city" && nested[0].pointer === "/user/address/city",
    `yol: ${nested[0]?.path}`,
  );

  const arrIndex = diffJson({ tags: ["a", "b", "c"] }, { tags: ["a", "x", "c"] }, INDEX_MODE);
  check(
    "json-ferq: mövqeyə görə rejimdə massiv indeksi yolda görünür",
    arrIndex.length === 1 && arrIndex[0].path === "tags[1]" && arrIndex[0].after === "x",
    `alındı: ${JSON.stringify(arrIndex)}`,
  );

  const arrKey = diffJson(
    { items: [{ id: 1, v: "x" }, { id: 2, v: "y" }] },
    { items: [{ id: 1, v: "x" }, { id: 3, v: "z" }] },
    KEY_MODE,
  );
  check(
    "json-ferq: açara görə rejim id=2-ni sildi, id=3-ü əlavə etdi",
    arrKey.length === 2 &&
      arrKey.some((e) => e.op === "remove" && (e.before as { id: number }).id === 2) &&
      arrKey.some((e) => e.op === "add" && (e.after as { id: number }).id === 3),
    `alındı: ${JSON.stringify(arrKey)}`,
  );

  const swapped = diffJson({ list: ["a", "b"] }, { list: ["b", "a"] }, INDEX_MODE);
  const swappedOrderFree = diffJson({ list: ["a", "b"] }, { list: ["b", "a"] }, INDEX_MODE_ORDER_FREE);
  check(
    "json-ferq: orderSensitive sönəndə xalis yerdəyişmə heç bir fərq vermir",
    swapped.length === 2 && swappedOrderFree.length === 0,
    `hessas: ${swapped.length}, hessas-deyil: ${swappedOrderFree.length}`,
  );

  const emptyObjects = diffJson({}, {}, INDEX_MODE);
  check("json-ferq: iki boş obyekt fərqsizdir", emptyObjects.length === 0, `alındı: ${JSON.stringify(emptyObjects)}`);

  const singleElement = diffJson({ list: ["yalnız"] }, { list: ["tək"] }, INDEX_MODE);
  check(
    "json-ferq: tək elementli massiv düzgün diff verir",
    singleElement.length === 1 && singleElement[0].path === "list[0]",
    `alındı: ${JSON.stringify(singleElement)}`,
  );

  const rootTypeChange = diffJson([1, 2], { a: 1 }, INDEX_MODE);
  check(
    "json-ferq: kökün özü tip dəyişəndə path boş sətir olur",
    rootTypeChange.length === 1 && rootTypeChange[0].path === "" && rootTypeChange[0].op === "type-change",
    `alındı: ${JSON.stringify(rootTypeChange)}`,
  );

  const brokenJson = parseJsonSafe("{ad: 'Kamran'}");
  check("json-ferq: pozuq JSON throw etmir, error qaytarır", brokenJson.ok === false, `alındı: ${JSON.stringify(brokenJson)}`);

  const badPatchApply = applyJsonPatch({ a: 1 }, [{ op: "replace", path: "/nonexistent/deep", value: 2 }]);
  check("json-ferq: mövcud olmayan patch yolu throw etmir, error qaytarır", badPatchApply.ok === false, `alındı: ${JSON.stringify(badPatchApply)}`);

  const roundTripA: JsonValue = { name: "Ali", tags: [{ id: 1, v: "x" }, { id: 2, v: "y" }, { id: 3, v: "z" }] };
  const roundTripB: JsonValue = { name: "Ali", tags: [{ id: 1, v: "x" }, { id: 3, v: "z" }, { id: 4, v: "w" }] };
  const roundTripEntries = diffJson(roundTripA, roundTripB, KEY_MODE);
  const patch = toJsonPatch(roundTripEntries);
  const applied = applyJsonPatch(roundTripA, patch);
  check(
    "json-ferq: JSON Patch tətbiq edilsə ikinci JSON alınır (round-trip)",
    applied.ok && JSON.stringify(applied.result) === JSON.stringify(roundTripB),
    `alındı: ${applied.ok ? JSON.stringify(applied.result) : applied.error}`,
  );
};
