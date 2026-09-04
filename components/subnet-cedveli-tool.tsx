"use client";

import { ReferenceTable } from "./reference-table";
import { subnetCedveliRows, subnetCedveliSections } from "../lib/subnet-cedveli";

export function SubnetCedveliTool() {
  return (
    <ReferenceTable
      rows={subnetCedveliRows}
      sections={subnetCedveliSections}
      placeholder="/24, 255.255.255.0, 0.0.0.255 və ya 172.16.0.0/12 yaz"
      footnote="IPv4 sətirləri /32-dən /0-a qədər hər prefiksi əhatə edir, IPv6 sətirləri isə praktikada rast gəlinən prefikslərlə (host aralığı, broadcast kimi hər IPv4-ə xas cəhət olmadan) məhdudlaşır. Nümunə ünvanlar RFC 5737 və RFC 3849-un sənədləşmə bloklarından götürülüb."
    />
  );
}
