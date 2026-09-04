"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";
import { ToolSegmented } from "./tabs";
import { DEFAULT_SLUG_OPTIONS, slugify, type SlugSeparator } from "../lib/slug";

const SEPARATOR_OPTIONS: { value: SlugSeparator; label: string }[] = [
  { value: "-", label: "defis" },
  { value: "_", label: "alt xətt" },
];

/* Carries several of the accented letters and the dotted/dotless-I trap in
   one title, so arriving at the tool with an empty field still demonstrates
   the whole point of it with one click. */
const SAMPLE_TITLE = "İnternetdə Sürət Ölçmək üçün 5 Vasitə";

export function SlugTool() {
  const [title, setTitle] = useState("");
  const [separator, setSeparator] = useState<SlugSeparator>(DEFAULT_SLUG_OPTIONS.separator);
  const [maxLength, setMaxLength] = useState(0);
  const [lowercase, setLowercase] = useState(DEFAULT_SLUG_OPTIONS.lowercase);

  const slug = useMemo(
    () =>
      slugify(title, {
        separator,
        lowercase,
        maxLength: maxLength > 0 ? maxLength : undefined,
      }),
    [title, separator, maxLength, lowercase],
  );

  return (
    <div className="mt-8">
      <ToolPanel>
        <ToolPanelHeader
          title="Slug"
          action={
            <>
              <ToolSegmented
                label="Ayırıcı"
                options={SEPARATOR_OPTIONS}
                value={separator}
                onChange={setSeparator}
              />
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Maks. uzunluq
                <ToolInput
                  type="number"
                  min={0}
                  max={200}
                  value={maxLength}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setMaxLength(Math.min(200, Math.max(0, Math.round(next))));
                  }}
                  className="h-8 w-16 px-2 text-xs"
                />
              </label>
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                <input
                  type="checkbox"
                  checked={lowercase}
                  onChange={(event) => setLowercase(event.target.checked)}
                  className="size-4 accent-[var(--color-accent)]"
                />
                Kiçik hərf
              </label>
              <ToolButton size="chip" onClick={() => setTitle(SAMPLE_TITLE)}>
                Nümunə
              </ToolButton>
              <ToolButton size="chip" onClick={() => setTitle("")} disabled={title === ""}>
                Təmizlə
              </ToolButton>
            </>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <ToolField
            label="Başlıq"
            htmlFor="slug-title-input"
            note="Texniki termin ingiliscə qalır: websocket-nədir yazsan, slug websocket-nedir olur — veb-soket-nedir yox."
          >
            <ToolInput
              id="slug-title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Node.js-də WebSocket necə işləyir?"
            />
          </ToolField>

          <ToolResultPanel
            title="Slug"
            hint={
              maxLength > 0 ? (
                <span className="tabular-nums">
                  {slug.length}/{maxLength}
                </span>
              ) : (
                <span className="tabular-nums">{slug.length} simvol</span>
              )
            }
            action={<CopyButton value={slug} label="slug-u kopyala" />}
          >
            <div className="p-3">
              <ToolOutput>
                {slug === "" ? <span className="text-muted">Başlıq yaz.</span> : slug}
              </ToolOutput>
              {slug !== "" && (
                <p className="mt-2 truncate font-mono text-xs text-muted">/bloq/{slug}</p>
              )}
            </div>
          </ToolResultPanel>
        </div>

        {slug === "" && title.trim() !== "" && (
          <div className="border-t border-rule p-4">
            <ToolNote tone="accent" title="Slug boş çıxdı">
              Başlıq yalnız durğu işarələrindən ibarətdir — heç bir hərf və ya rəqəm tapılmadı.
            </ToolNote>
          </div>
        )}
      </ToolPanel>
    </div>
  );
}
