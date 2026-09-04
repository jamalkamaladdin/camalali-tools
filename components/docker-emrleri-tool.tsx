"use client";

import { ReferenceTable } from "./reference-table";
import { dockerEmrleriRows, dockerEmrleriSections } from "../lib/docker-emrleri";

/*
 * The interactive half of the docker-emrleri reference: a search box and a
 * sectioned list, both drawn by `ReferenceTable`. The rows and their search
 * text live in `lib/tools/docker-emrleri.ts`.
 */
export function DockerEmrleriTool() {
  return (
    <ReferenceTable
      rows={dockerEmrleriRows}
      sections={dockerEmrleriSections}
      placeholder="Əmr və ya açar söz axtar (məsələn: prune, compose, volume)"
      footnote="Nümunələrdəki əmrlər işləkdir, amma konteyner və şəkil adları uydurmadır — öz adlarınla əvəz et."
    />
  );
}
