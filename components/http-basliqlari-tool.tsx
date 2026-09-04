"use client";

import { ReferenceTable } from "./reference-table";
import { httpBasliqlariRows, httpBasliqlariSections } from "../lib/http-basliqlari";

export function HttpBasliqlariTool() {
  return (
    <ReferenceTable
      rows={httpBasliqlariRows}
      sections={httpBasliqlariSections}
      placeholder="Başlığın adı və ya açar söz axtar: cache, cors, cookie..."
    />
  );
}
