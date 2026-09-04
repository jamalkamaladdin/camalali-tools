"use client";

import { ReferenceTable } from "./reference-table";
import { linuxEmrleriRows, linuxEmrleriSections } from "../lib/linux-emrleri";

export function LinuxEmrleriTool() {
  return (
    <ReferenceTable
      rows={linuxEmrleriRows}
      sections={linuxEmrleriSections}
      placeholder="Əmr adı və ya nə etmək istədiyini yaz: fayl tap, prosesi öldür..."
    />
  );
}
