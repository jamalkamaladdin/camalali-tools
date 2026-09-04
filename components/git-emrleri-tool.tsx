"use client";

import { ReferenceTable } from "./reference-table";
import { gitEmrleriRows, gitEmrleriSections } from "../lib/git-emrleri";

/*
 * The interactive half of the git-emrleri reference: a search box and a
 * sectioned list, both drawn by `ReferenceTable`. The rows and their search
 * text live in `lib/tools/git-emrleri.ts`.
 */
export function GitEmrleriTool() {
  return (
    <ReferenceTable
      rows={gitEmrleriRows}
      sections={gitEmrleriSections}
      placeholder="Əmr və ya açar söz axtar (məsələn: rebase, geri, stash)"
      footnote="Nümunələrdəki əmrlər işləkdir, amma budaq və fayl adları uydurmadır: öz adlarınla əvəz et."
    />
  );
}
