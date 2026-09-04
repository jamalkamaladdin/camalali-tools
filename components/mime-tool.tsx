"use client";

import { ReferenceTable } from "./reference-table";
import { mimeRows, mimeSections } from "../lib/mime";

export function MimeTool() {
  return (
    <ReferenceTable
      rows={mimeRows}
      sections={mimeSections}
      placeholder="Uzantı və ya MIME tipi axtar, məsələn .webp ya da image/webp"
      footnote="Siyahı IANA-nın media type reyestrinə əsaslanır; tam reyestr bundan qat-qat böyükdür, burada ən çox rast gəlinən tiplər var."
    />
  );
}
