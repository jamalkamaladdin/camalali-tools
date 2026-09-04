"use client";

import { ReferenceTable } from "./reference-table";
import { dnsQeydTipleriRows, dnsQeydTipleriSections } from "../lib/dns-qeyd-tipleri";

export function DnsQeydTipleriTool() {
  return (
    <ReferenceTable
      rows={dnsQeydTipleriRows}
      sections={dnsQeydTipleriSections}
      placeholder="Axtar, məsələn: «cname» və ya «257»"
      footnote="Mənbə IANA-nın DNS Parameters reyestri və müvafiq RFC-lərdir. ALIAS/ANAME kimi provayder xüsusiyyətləri DNS tipi deyil, ona görə burada ayrıca sətir kimi yox, aid olduqları qeydin izahı içində yer alır."
    />
  );
}
