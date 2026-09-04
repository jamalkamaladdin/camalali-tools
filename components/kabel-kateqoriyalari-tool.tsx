"use client";

import { ReferenceTable } from "./reference-table";
import { kabelKateqoriyalariRows, kabelKateqoriyalariSections } from "../lib/kabel-kateqoriyalari";

export function KabelKateqoriyalariTool() {
  return (
    <ReferenceTable
      rows={kabelKateqoriyalariRows}
      sections={kabelKateqoriyalariSections}
      placeholder="Kateqoriya, ekran kodu, lif tipi ya da konnektor axtar, məsələn cat6 ya da t568b"
      footnote="Rəqəmlər TIA-568, ISO/IEC 11801 və IEEE 802.3 standartlarına əsaslanır; real nəticə kabelin keyfiyyətindən, uzunluğundan və mühitdən asılı olaraq dəyişə bilər."
    />
  );
}
