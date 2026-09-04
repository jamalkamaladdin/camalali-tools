"use client";

import { ReferenceTable } from "./reference-table";
import { portlarRows, portlarSections } from "../lib/portlar";

export function PortlarTool() {
  return (
    <ReferenceTable
      rows={portlarRows}
      sections={portlarSections}
      placeholder="Port nömrəsi və ya xidmət adı axtar, məsələn 5432 ya da postgres"
      footnote="Siyahı IANA-nın rəsmi qeydiyyatı ilə geniş yayılmış konvensiyaları birləşdirir; port hər zaman kimin nəyi dinlədiyi ilə deyil, kim həmin nömrəni seçdiyi ilə də bağlıdır."
    />
  );
}
