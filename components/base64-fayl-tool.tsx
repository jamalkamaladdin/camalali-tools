"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolSegmented, ToolTabs, type ToolTabItem } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
  ToolTextArea,
} from "./ui";
import {
  MAX_FILE_BYTES,
  base64ByteLength,
  base64ToBytes,
  buildCssUrlSnippet,
  buildDataUri,
  buildImgTagSnippet,
  bytesToBase64,
  exceedsLimit,
  growthPercent,
  resolveMime,
  stripDataUriPrefix,
  wrapBase64,
  type MimeResolution,
} from "../lib/base64-fayl";

/*
 * Two directions, two tabs, one shared set of primitives. Both directions
 * read a `File`/`Blob` through the browser's own APIs (`FileReader`,
 * `URL.createObjectURL`) rather than anything from `lib/base64-fayl`
 * — that file is pure byte arithmetic, and the DOM plumbing that turns a
 * click into bytes belongs here, in the one file allowed to import it.
 */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

type WrapOption = "off" | "on";

const WRAP_OPTIONS: { value: WrapOption; label: string }[] = [
  { value: "off", label: "Bölünməsin" },
  { value: "on", label: "76 simvolda böl" },
];

const MIME_SOURCE_LABEL: Record<MimeResolution["source"], string> = {
  "magic-bytes": "sehrli baytlardan",
  extension: "uzantıdan",
  naməlum: "tanınmadı",
};

type EncodeState =
  | { phase: "idle" }
  | { phase: "error"; message: string }
  | {
      phase: "done";
      fileName: string;
      byteLength: number;
      base64: string;
      mime: MimeResolution;
      dataUri: string;
      /** Read anyway — the limit is a comfort warning, not a hard refusal. */
      exceeded: boolean;
    };

function EncodeTab() {
  const [state, setState] = useState<EncodeState>({ phase: "idle" });
  const [wrapped, setWrapped] = useState<WrapOption>("off");
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const mime = resolveMime(file.name, bytes);
      const base64 = bytesToBase64(bytes);
      setState({
        phase: "done",
        fileName: file.name,
        byteLength: bytes.length,
        base64,
        mime,
        dataUri: buildDataUri(mime.mime, base64),
        exceeded: exceedsLimit(bytes.length),
      });
    } catch {
      setState({ phase: "error", message: "Fayl oxunmadı. Başqa fayl sına." });
    }
  };

  return (
    <div className="space-y-4">
      <ToolPanel>
        <ToolPanelHeader title="Fayl seç" />
        <div className="flex flex-wrap items-center gap-3 p-4">
          <ToolButton onClick={() => inputRef.current?.click()}>Fayl seç</ToolButton>
          <input ref={inputRef} type="file" className="hidden" onChange={onFile} />
          <ToolSegmented label="Sətir bölgüsü" value={wrapped} onChange={setWrapped} options={WRAP_OPTIONS} />
        </div>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Diqqət">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "done" && (
        <EncodeResult
          fileName={state.fileName}
          byteLength={state.byteLength}
          base64={state.base64}
          mime={state.mime}
          dataUri={state.dataUri}
          exceeded={state.exceeded}
          wrapped={wrapped === "on"}
        />
      )}
    </div>
  );
}

function EncodeResult({
  fileName,
  byteLength,
  base64,
  mime,
  dataUri,
  exceeded,
  wrapped,
}: {
  fileName: string;
  byteLength: number;
  base64: string;
  mime: MimeResolution;
  dataUri: string;
  exceeded: boolean;
  wrapped: boolean;
}) {
  const encodedLength = base64ByteLength(byteLength);
  const growth = growthPercent(byteLength);
  const displayed = wrapped ? wrapBase64(base64) : base64;

  return (
    <ToolResultPanel title={fileName} hint={mime.mime}>
      <div className="space-y-4 p-4">
        {exceeded && (
          <ToolNote tone="accent" title="Fayl böyükdür">
            {formatBytes(byteLength)}, {formatBytes(MAX_FILE_BYTES)} rahatlıq həddini keçir. Çevirmə
            baş tutdu, amma aşağıdakı mətn çox uzundur və bəzi sahələrdə yavaş görünə bilər.
          </ToolNote>
        )}

        {mime.mismatch && (
          <ToolNote tone="accent" title="Uzantı ilə məzmun uyğun gəlmir">
            Fayl adının uzantısı başqa formatı bildirir, amma baytların özü{" "}
            <span className="font-mono text-xs">{mime.mime}</span> formatını göstərir: baytlara güvənilib.
          </ToolNote>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ToolStat label="Orijinal" value={formatBytes(byteLength)} />
          <ToolStat label="Base64" value={formatBytes(encodedLength)} tone="accent" />
          <ToolStat label="Artım" value={`+${growth.toFixed(1)}%`} />
          <ToolStat label="MIME mənbəyi" value={MIME_SOURCE_LABEL[mime.source]} />
        </div>

        <ToolField label="Data URI" hint={<CopyButton value={dataUri} label="kopyala" />}>
          <ToolOutput className="max-h-40 overflow-y-auto">{dataUri}</ToolOutput>
        </ToolField>

        <ToolField label="Base64 mətni" hint={<CopyButton value={displayed} label="kopyala" />}>
          <ToolOutput className="max-h-64 overflow-y-auto">{displayed}</ToolOutput>
        </ToolField>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToolField label="<img> sətri" hint={<CopyButton value={buildImgTagSnippet(dataUri)} label="kopyala" />}>
            <ToolOutput className="max-h-24 overflow-y-auto">{buildImgTagSnippet(dataUri)}</ToolOutput>
          </ToolField>
          <ToolField label="CSS url()" hint={<CopyButton value={buildCssUrlSnippet(dataUri)} label="kopyala" />}>
            <ToolOutput className="max-h-24 overflow-y-auto">{buildCssUrlSnippet(dataUri)}</ToolOutput>
          </ToolField>
        </div>
      </div>
    </ToolResultPanel>
  );
}

type DecodeState = { phase: "idle" } | { phase: "error"; message: string } | { phase: "done"; byteLength: number };

function DecodeTab() {
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState("fayl.bin");
  const [state, setState] = useState<DecodeState>({ phase: "idle" });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { mime, base64 } = stripDataUriPrefix(input);
    const decoded = base64ToBytes(base64);
    if (!decoded.ok) {
      setState({ phase: "error", message: decoded.error });
      return;
    }

    // A fresh copy backed by a plain ArrayBuffer: `Uint8Array.prototype.buffer`
    // is typed as `ArrayBufferLike` (it could be a `SharedArrayBuffer`), which
    // `Blob` does not accept — copying through the constructor pins it back
    // down to the concrete `ArrayBuffer` type `Blob` wants.
    const blob = new Blob([new Uint8Array(decoded.bytes)], { type: mime ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName.trim() === "" ? "fayl.bin" : fileName.trim();
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setState({ phase: "done", byteLength: decoded.bytes.length });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <ToolPanel>
        <ToolPanelHeader title="Base64 mətni" />
        <div className="space-y-4 p-4">
          <ToolField
            label="Base64 və ya data URI"
            htmlFor="base64-fayl-decode-input"
            note="Data URI (data:...;base64,...) yapışdırsan, prefiks özü ayrılır."
          >
            <ToolTextArea
              id="base64-fayl-decode-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={8}
              spellCheck={false}
            />
          </ToolField>

          <ToolField label="Fayl adı" htmlFor="base64-fayl-decode-name">
            <ToolInput
              id="base64-fayl-decode-name"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              spellCheck={false}
              autoCapitalize="off"
            />
          </ToolField>

          <ToolButton type="submit">Fayla çevir və endir</ToolButton>
        </div>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Dekod alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "done" && (
        <ToolNote title="Endirildi">{formatBytes(state.byteLength)} fayl yaradıldı və endirmə başladıldı.</ToolNote>
      )}
    </form>
  );
}

export function Base64FaylTool() {
  const tabs: ToolTabItem[] = [
    { id: "encode", label: "Fayl → Base64", content: <EncodeTab /> },
    { id: "decode", label: "Base64 → Fayl", content: <DecodeTab /> },
  ];

  return (
    <div className="mt-8 space-y-5">
      <ToolNote>
        Fayl seçilən kimi, base64-ə çevrilən kimi: hamısı brauzerdə baş verir. Bu alətin şəbəkə
        marşrutu yoxdur, heç nə serverə göndərilmir.
      </ToolNote>

      <ToolTabs idPrefix="base64-fayl" items={tabs} />
    </div>
  );
}
