import { Fragment, type ReactNode } from "react";

/*
 * Backticks in the tool copy, drawn as code.
 *
 * The copy has always been written with them — `Cache-Control`, `git rebase
 * -i`, `chmod 600` — because the person writing it is writing about strings a
 * reader has to type exactly, and a backtick is how that is marked everywhere
 * else they write. Until now nothing read them, so the marks were served
 * literally; the reference tables that arrived with the arayis family turned
 * that from two stray characters on one page into two hundred and eighty-one
 * across eleven.
 *
 * Marking rather than parsing: this is not Markdown and does not want to be.
 * A tool's `note` is one sentence, and the only thing in it that ever needs a
 * different face is a literal string.
 */

/* A filled well rather than a rule, which is how the system marks a literal
   string inside running text. The ground is a system fill: it is defined as a
   translucent grey, so it darkens whatever surface it lands on by the same
   amount instead of naming a colour that only works on one of them, and the
   ink over it stays the ink of the sentence — no new contrast pair to fail.
   0.94em keeps the padded span from growing its line. The code face comes
   from the base layer, which sets it on `code` itself. */
const codeClass =
  "rounded-sm bg-fill-3 px-1 py-px text-[0.94em] whitespace-nowrap";

/**
 * The text with its backticked runs wrapped in `<code>`.
 *
 * An unpaired backtick leaves the string alone rather than wrapping whatever
 * follows it to the end of the sentence: a typo in the copy should look like a
 * typo, not like a formatting failure that swallowed half a paragraph.
 */
export function withInlineCode(text: string): ReactNode {
  const parts = text.split("`");
  if (parts.length < 3 || parts.length % 2 === 0) return text;

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className={codeClass}>
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/** The same text with the marks dropped — for JSON-LD, where they are noise. */
export function stripInlineCode(text: string): string {
  return text.replace(/`/g, "");
}
