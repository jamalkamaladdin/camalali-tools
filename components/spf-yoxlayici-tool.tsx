"use client";

import { useState, type FormEvent } from "react";
import { normalizeDomain } from "../lib/dns";
import {
  SPF_LOOKUP_LIMIT,
  SPF_VOID_LIMIT,
  type SpfExpansion,
  type SpfNode,
  type SpfVerdict,
} from "../lib/spf-yoxlayici";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/* Three domains that show three different shapes: Google Workspace's own SPF
   nests several `include`s worth walking, GitHub's is a short, clean record,
   and this site has none at all — the "no record" branch of the tool. */
const EXAMPLES = ["google.com", "github.com", "camalali.com"];

const RECORD_PREFIX = /^v=spf1(\s|$)/i;

const VERDICT_LABELS: Record<SpfVerdict, string> = {
  ok: "qaydasındadır",
  thin: "sərhəd nazikdir",
  permerror: "permerror",
};

type State =
  | { phase: "idle" }
  | { phase: "loading"; label: string }
  | { phase: "done"; report: SpfExpansion }
  | { phase: "error"; message: string };

export function SpfYoxlayiciTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(rawInput: string) {
    const trimmed = rawInput.trim();
    if (trimmed === "") {
      setState({ phase: "error", message: "Boş sahə — domen adı və ya v=spf1 qeydi yaz." });
      return;
    }

    const pasted = RECORD_PREFIX.test(trimmed);
    /* Validated here too, the same as the other network tools: a typo costs a
       keystroke instead of a round trip and a slot in the rate limiter. A
       pasted record skips this — its own syntax is checked once it reaches
       the server, where the parser actually lives. */
    if (!pasted) {
      const checked = normalizeDomain(trimmed);
      if (!checked.ok) {
        setState({ phase: "error", message: checked.error });
        return;
      }
    }

    setState({ phase: "loading", label: pasted ? "yapışdırılan qeyd" : trimmed });
    try {
      const response = await fetch(`/api/alet/spf-yoxlayici?domen=${encodeURIComponent(trimmed)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: SpfExpansion; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", report: payload.data });
      } else {
        setState({ phase: "error", message: payload.message ?? "Sorğu alınmadı." });
      }
    } catch {
      setState({ phase: "error", message: "Serverlə əlaqə qurulmadı. Bir azdan yenidən yoxla." });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(input);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət sorğunu serverə göndərir">
        Yazdığın domenin (və qeyddə adı keçən hər <span className="font-mono text-xs">include</span>/
        <span className="font-mono text-xs">redirect</span> domeninin) TXT qeydini bu saytın serveri özü oxuyur —
        brauzerin heç bir ad serverinə birbaşa müraciət etmir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Domen və ya SPF mətni"
          action={
            <>
              {EXAMPLES.map((example) => (
                <ToolButton
                  key={example}
                  size="chip"
                  disabled={busy}
                  onClick={() => {
                    setInput(example);
                    void run(example);
                  }}
                >
                  {example}
                </ToolButton>
              ))}
            </>
          }
        />

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToolField
              label="Domen adı və ya tam qeyd"
              htmlFor="spf-yoxlayici-input"
              className="min-w-56 flex-1"
              note='Domen yazsan qeyd DNS-dən gətirilir. "v=spf1" ilə başlayan mətn yapışdırsan, birbaşa o təhlil edilir — yalnız içindəki include/redirect-lər DNS-dən oxunur.'
            >
              <ToolInput
                id="spf-yoxlayici-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com və ya v=spf1 include:_spf.example.com -all"
                spellCheck={false}
                autoComplete="off"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Yoxlanır…" : "Yoxla"}
            </ToolButton>
          </div>
        </form>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "loading" && (
        <p className="font-ui text-sm text-muted">«{state.label}» üçün SPF ağacı genişləndirilir…</p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: SpfExpansion }) {
  const hasRecord = report.root.record !== null;
  const hasTruncation = report.cycles.length > 0 || report.depthExceeded || report.budgetExceeded;

  return (
    <div className="space-y-5">
      {report.findings.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {report.findings.map((finding, index) => (
            <ToolNote key={`${finding.title}-${index}`} tone={finding.tone} title={finding.title}>
              {finding.text}
            </ToolNote>
          ))}
        </div>
      ) : (
        /* An empty findings list on a readable record is a clean result, not
           an absence — the same reasoning `dns-tool` uses for its own list. */
        <ToolNote title="Diqqət çəkən qüsur tapılmadı">
          Qeyd limit daxilindədir və «all» qaydası aydındır.
        </ToolNote>
      )}

      {hasRecord && (
        <>
          <div className="@container">
            <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-3">
              <ToolStat
                label="DNS sorğusu"
                value={`${report.totalLookups}/${SPF_LOOKUP_LIMIT}`}
                tone={
                  report.verdict === "permerror" ? "accent" : report.verdict === "thin" ? "warning" : "default"
                }
                note={VERDICT_LABELS[report.verdict]}
              />
              <ToolStat
                label="Boş axtarış"
                value={`${report.voidLookups}/${SPF_VOID_LIMIT}`}
                tone={report.voidLookups > SPF_VOID_LIMIT ? "accent" : "default"}
              />
              <ToolStat
                label="Kəsilmə"
                value={hasTruncation ? "var" : "yoxdur"}
                tone={hasTruncation ? "warning" : "default"}
                note={
                  report.cycles.length > 0
                    ? "dövr"
                    : report.depthExceeded
                      ? "dərinlik həddi"
                      : report.budgetExceeded
                        ? "sorğu büdcəsi"
                        : undefined
                }
              />
            </div>
          </div>

          <ToolResultPanel title="SPF ağacı" hint={report.root.domain}>
            <div className="space-y-1 p-3">
              <SpfTreeNode node={report.root} via={null} depth={0} />
            </div>
          </ToolResultPanel>
        </>
      )}
    </div>
  );
}

function SpfTreeNode({
  node,
  via,
  depth,
}: {
  node: SpfNode;
  via: "include" | "redirect" | null;
  depth: number;
}) {
  return (
    <div className={depth > 0 ? "mt-2 border-l-2 border-rule pl-3" : ""}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {via !== null && <span className="font-ui text-[11px] text-muted">{via}</span>}
        <span className="min-w-0 font-mono text-sm break-all">{node.domain}</span>
        {node.record !== null && (
          <span className="font-ui text-[11px] tabular-nums text-muted">{node.ownLookups} sorğu</span>
        )}
      </div>

      {node.record !== null ? (
        <p className="mt-1 font-mono text-xs break-all text-muted">{node.record}</p>
      ) : (
        <p className="mt-1 font-ui text-xs text-muted">
          {node.error ?? "TXT sorğusu heç nə qaytarmadı (boş cavab)."}
        </p>
      )}

      {node.children.length > 0 && (
        <div>
          {node.children.map((child, index) => (
            <SpfTreeNode
              key={`${child.node.domain}-${index}`}
              node={child.node}
              via={child.via}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
