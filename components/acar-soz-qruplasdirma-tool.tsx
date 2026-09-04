"use client";

import { useMemo, useState } from "react";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  clusterKeywords,
  clustersToCsv,
  parseKeywordList,
} from "../lib/acar-soz-qruplasdirma";

/** A cluster needs at least this many members — a single keyword sharing a stem with nobody else in the list is a group of one, which is not a group, it is an orphan. */
const MIN_CLUSTER_SIZE = 2;

const SAMPLE =
  "seo aləti,2400\npulsuz seo alətləri,900\nseo alətlərinin siyahısı,300\nkeyword tədqiqatı aləti,150\naçar söz sıxlığı yoxlama,80\nbaşlıq generatoru,600\nmeta başlıq generatoru,250\nsxem generatoru,90\nbişirmə resepti,40";

/**
 * The file is built in the tab and handed to the browser's own download path
 * — nothing is uploaded to produce it. The byte-order mark keeps Excel from
 * opening a UTF-8 CSV in the local code page, which would turn every
 * diacritic in a visitor's own keywords into a question mark.
 */
function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatVolume(volume: number | null): string {
  return volume === null ? "—" : volume.toLocaleString("az-AZ");
}

export function AcarSozQruplasdirmaTool() {
  const [text, setText] = useState("");

  const parsed = useMemo(() => parseKeywordList(text), [text]);
  const { clusters, orphans } = useMemo(
    () => clusterKeywords(parsed.items, { minSize: MIN_CLUSTER_SIZE }),
    [parsed.items],
  );

  const hasInput = parsed.items.length > 0;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Açar söz siyahısı"
          action={
            <>
              <ToolButton size="chip" onClick={() => setText(SAMPLE)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setText("")} disabled={text === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="p-4">
          <ToolField
            label="açar söz, həcm"
            htmlFor="acar-soz-qruplasdirma-input"
            note="Hər sətirdə bir açar söz. İstəyə görə vergül və ya tab ilə ayrılmış ikinci sütun — axtarış həcmi."
          >
            <ToolTextArea
              id="acar-soz-qruplasdirma-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"seo aləti,2400\npulsuz seo alətləri,900"}
              className="min-h-48"
              spellCheck={false}
            />
          </ToolField>
        </div>
      </ToolPanel>

      {parsed.error !== null && (
        <ToolNote tone="accent" title="Diqqət">
          {parsed.error}
        </ToolNote>
      )}

      {hasInput && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <ToolStat label="Açar söz" value={parsed.items.length} />
            <ToolStat label="Qrup" value={clusters.length} />
            <ToolStat label="Tək qalan" value={orphans.length} />
          </div>

          <ToolResultPanel
            title="Qruplar"
            hint={`${clusters.length} qrup`}
            action={
              <ToolButton
                size="chip"
                onClick={() => downloadCsv(clustersToCsv(clusters, orphans), "acar-soz-qruplari.csv")}
              >
                CSV kimi köçür
              </ToolButton>
            }
          >
            {clusters.length === 0 ? (
              <p className="p-3 font-ui text-xs text-muted">
                Heç bir açar söz başqası ilə ortaq söz paylaşmadı — hamısı aşağıda, tək qalanlar
                bölməsindədir.
              </p>
            ) : (
              <ToolAccordion>
                {clusters.map((cluster) => (
                  <ToolAccordionItem
                    key={cluster.sharedToken}
                    summary={cluster.head}
                    hint={`${cluster.items.length} söz · ortaq: «${cluster.sharedToken}»`}
                    defaultOpen={cluster === clusters[0]}
                  >
                    <ul className="space-y-1">
                      {cluster.items.map((item, index) => (
                        <li
                          key={`${item.keyword}-${index}`}
                          className="flex items-center justify-between gap-3 font-ui text-xs"
                        >
                          <span className="min-w-0 truncate">{item.keyword}</span>
                          <span className="shrink-0 tabular-nums text-muted">
                            {formatVolume(item.volume)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </ToolAccordionItem>
                ))}
              </ToolAccordion>
            )}
          </ToolResultPanel>

          <ToolResultPanel title="Tək qalanlar" hint={`${orphans.length} söz`}>
            {orphans.length === 0 ? (
              <p className="p-3 font-ui text-xs text-muted">Bütün sözlər bir qrupa düşdü.</p>
            ) : (
              <ul className="space-y-1 p-3">
                {orphans.map((item, index) => (
                  <li
                    key={`${item.keyword}-${index}`}
                    className="flex items-center justify-between gap-3 font-ui text-xs"
                  >
                    <span className="min-w-0 truncate">{item.keyword}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatVolume(item.volume)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ToolResultPanel>
        </>
      )}

      <ToolNote tone="accent" title="Alqoritm sadədir, gizli deyil">
        Hər açar söz kökündən şəkilçi atılır və siyahıda ən çox təkrarlanan ortaq kökə görə qrupa
        yerləşir — hər qrupun yanında görünən ortaq söz məhz bu hesabın nəticəsidir. Bu, tam
        linqvistik təhlil deyil: konservativ bir kökləmə qaydasıdır və nadir hallarda əlaqəsiz iki
        söz eyni kökə düşə bilər.
      </ToolNote>
    </div>
  );
}
