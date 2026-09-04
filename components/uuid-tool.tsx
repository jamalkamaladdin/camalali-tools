"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { formatAzStamp } from "../shared/az-date";
import {
  formatUuid,
  generateUuidV4,
  generateUuidV7,
  inspectUuid,
  isStandardUuidVersion,
  type UuidFormatOptions,
  type UuidInspection,
} from "../lib/uuid";
import { CopyButton } from "../shared/copy-button";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";
import { ToolSegmented } from "./tabs";

type Version = "v4" | "v7";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const VERSION_OPTIONS = [
  { value: "v4" as const, label: "v4" },
  { value: "v7" as const, label: "v7" },
];

/*
 * The note beside the generator, keyed by the version it mints. It used to
 * double as the "is this a version we recognise" test for a pasted UUID, and
 * that is why a perfectly standard v3 or v5 was reported as non-standard: the
 * record only held the versions this tool can generate. The membership test now
 * lives in `lib/tools/uuid.ts`, where the RFC list is provable.
 */
const VERSION_HINT: Record<number, string> = {
  4: "Tam təsadüfi — indeks sırasını qorumur.",
  7: "İlk 48 bit unix millisaniyə — vaxta görə sıralanır.",
};

const PENDING = "UUID-lər brauzerdə yaradılır…";

/* Nothing to subscribe to: the question "is this the browser yet" is answered
   once and never changes again. */
const subscribeToNothing = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function UuidTool() {
  const [version, setVersion] = useState<Version>("v4");
  const [count, setCount] = useState(10);
  const [uppercase, setUppercase] = useState(false);
  const [noDashes, setNoDashes] = useState(false);
  const [quoted, setQuoted] = useState(false);
  // Bumped only by the explicit regenerate button — a fresh batch replacing
  // itself under the visitor's cursor while they are reading it is worse than
  // a batch that waits to be asked for.
  const [seed, setSeed] = useState(0);

  /* Random bytes are a browser fact and the server has none. The snapshot is
     false in the static HTML and during hydration, so the two agree, and the
     first batch is minted only on the render after that. */
  const onBrowser = useSyncExternalStore(subscribeToNothing, onClient, onServer);

  const [inspectInput, setInspectInput] = useState("");

  const formatOptions: UuidFormatOptions = { uppercase, noDashes, quoted };

  /*
   * Two bugs lived in one `useMemo` here, and both come from generating inside
   * a render.
   *
   * It ran during the prerender, so the static HTML carried ten fixed UUIDs
   * that every visitor was served and that hydration then had to contradict —
   * the only tool on the site that threw a React error on load. And it listed
   * the formatting switches as dependencies, so ticking "Böyük hərf" minted a
   * new batch: copy an id, adjust the format, and you have copied a different
   * id from the one on screen.
   *
   * Generation now waits for the browser and answers only to an explicit act —
   * arriving, "Yenidən yarat", a version or a count change. Formatting is a
   * separate, pure transform of the batch that already exists.
   */
  const ids = useMemo(
    () =>
      onBrowser
        ? Array.from({ length: count }, () =>
            version === "v4" ? generateUuidV4() : generateUuidV7(),
          )
        : [],
    // `seed` changes nothing about the shape of the output; it is here so that
    // "Yenidən yarat" has something to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onBrowser, version, count, seed],
  );

  const generatedText = useMemo(
    () => ids.map((id) => formatUuid(id, formatOptions)).join("\n"),
    // `formatOptions` is rebuilt every render; its three fields are the real
    // dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, uppercase, noDashes, quoted],
  );

  const inspection = useMemo(() => {
    if (inspectInput.trim() === "") return null;
    return inspectUuid(inspectInput);
  }, [inspectInput]);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        {/* Six controls in one strip: `ToolPanelHeader` wraps and lays its
            action slot out as a row, so this no longer needs bespoke markup. */}
        <ToolPanelHeader
          title="UUID"
          action={
            <>
              <ToolSegmented
                label="UUID versiyası"
                options={VERSION_OPTIONS}
                value={version}
                onChange={setVersion}
              />
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Say
                <ToolInput
                  type="number"
                  min={1}
                  max={100}
                  value={count}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setCount(Math.min(100, Math.max(1, Math.round(next))));
                  }}
                  className="h-8 w-16 px-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={uppercase}
                  onChange={(event) => setUppercase(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Böyük hərf
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={noDashes}
                  onChange={(event) => setNoDashes(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Defissiz
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={quoted}
                  onChange={(event) => setQuoted(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Dırnaq içində
              </label>
              <ToolButton size="chip" onClick={() => setSeed((s) => s + 1)}>
                Yenidən yarat
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <ToolNote>{VERSION_HINT[version === "v4" ? 4 : 7]}</ToolNote>

          {/* The batch is the one thing on this panel the tool made. The six
              controls in the header above and the "read an existing UUID"
              accordion below are both input and keep the input surface. */}
          <ToolResultPanel
            title="UUID-lər"
            hint={<span className="tabular-nums">{ids.length} ədəd</span>}
            action={<CopyButton value={generatedText} label="uuid-ləri kopyala" />}
            className="min-w-0"
          >
            <ToolOutput className="m-3 max-h-96 overflow-y-auto">
              {/* Before the first effect runs there is nothing to show, and
                  saying so is the honest render — the alternative is ten ids
                  baked into the page that are the same for everybody. */}
              {generatedText === "" ? (
                <span className="text-muted">{PENDING}</span>
              ) : (
                generatedText
              )}
            </ToolOutput>
          </ToolResultPanel>
        </div>
      </ToolPanel>

      <ToolAccordion>
        <ToolAccordionItem
          summary="Mövcud UUID-i oxu"
          hint="versiya · variant · vaxt möhürü"
        >
          <div className="max-w-xl">
            <ToolField
              label="UUID"
              htmlFor="uuid-inspect-input"
              hint="Defisli, defissiz, {…} və ya urn:uuid: formatı qəbul edilir."
              suffix={
                <ToolButton size="chip" onClick={() => setInspectInput(NIL_UUID)}>
                  Nil nümunə
                </ToolButton>
              }
            >
              <ToolInput
                id="uuid-inspect-input"
                value={inspectInput}
                onChange={(event) => setInspectInput(event.target.value)}
                placeholder="550e8400-e29b-41d4-a716-446655440000"
                spellCheck={false}
              />
            </ToolField>

            <div className="mt-4">
              <InspectResult inspection={inspection} />
            </div>
          </div>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function InspectResult({ inspection }: { inspection: UuidInspection | null }) {
  if (!inspection) {
    return (
      <p className="font-ui text-sm text-muted">
        UUID yapışdır — versiya, variant və (v1/v7 üçün) vaxt möhürü burada
        görünəcək.
      </p>
    );
  }

  if (!inspection.ok) {
    return (
      <ToolNote tone="accent" title="Düzgün UUID deyil">
        {inspection.error}
      </ToolNote>
    );
  }

  if (inspection.special) {
    const label =
      inspection.special === "nil"
        ? "nil UUID — bütün bitlər sıfırdır, «boş» dəyər kimi işlənir."
        : "max UUID — bütün bitlər 1-dir, açıq intervalın yuxarı sərhədi kimi işlənir.";
    return (
      <div className="space-y-4">
        <ToolNote tone="info" title={inspection.special === "nil" ? "Nil UUID" : "Max UUID"}>
          {label}
        </ToolNote>
        <ToolStat label="Normallaşdırılmış" value={inspection.normalized} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <ToolStat
          label="Versiya"
          value={
            isStandardUuidVersion(inspection.version)
              ? `v${inspection.version}`
              : `${inspection.version} (qeyri-standart)`
          }
        />
        <ToolStat label="Variant" value={inspection.variantLabel ?? "—"} />
      </div>

      {inspection.timestamp && (
        <ToolStat
          label={`Vaxt möhürü (${inspection.timestampSource})`}
          value={formatAzStamp(inspection.timestamp)}
          note="Yaradılan cihazın yerli saatına görə göstərilir."
        />
      )}

      <ToolField label="Normallaşdırılmış">
        <div className="flex items-center gap-2">
          <ToolInput readOnly value={inspection.normalized} className="font-mono" />
          <CopyButton value={inspection.normalized} label="uuid-i kopyala" />
        </div>
      </ToolField>
    </div>
  );
}
