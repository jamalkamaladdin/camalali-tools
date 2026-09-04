/*
 * Structured data, ready to sit inside a <script> tag.
 *
 * `JSON.stringify` escapes nothing that HTML cares about, so a string
 * containing `</script>` would close the tag it was written into and the rest
 * would be parsed as markup. Nothing in this repository does that today —
 * every field comes from our own content — but the gap is one editor away, and
 * the fix costs three replacements.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
