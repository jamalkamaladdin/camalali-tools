"use client";

import { ReferenceTable } from "./reference-table";
import { statusKodlariRows, statusKodlariSections } from "../lib/status-kodlari";

export function StatusKodlariTool() {
  return (
    <ReferenceTable
      rows={statusKodlariRows}
      sections={statusKodlariSections}
      placeholder="Kod, ad və ya açar söz axtar — 404, redirect, server error..."
      footnote="RFC 9110 və IANA-nın HTTP Status Code reyestrinə əsaslanır. Cloudflare-in öz 5xx genişlənmələri (520-527) reyestrin bir hissəsi deyil və bura daxil edilməyib."
    />
  );
}
