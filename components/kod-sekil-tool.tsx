"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHROME_HEIGHT_PX,
  computeCanvasDimensions,
  computeLineNumberGutterWidth,
  highlightCode,
  parseLineRanges,
  SUPPORTED_LANGS,
  SUPPORTED_THEMES,
  type HighlightedLine,
  type SupportedLang,
  type SupportedTheme,
} from "../lib/kod-sekil";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolTextArea,
} from "./ui";
import { ToolSegmented } from "./tabs";

/*
 * The DOM/canvas half of the code-to-image tool. Everything `kod-sekil.ts`
 * cannot do without a browser lives here: measuring the loaded monospace
 * font, drawing the rounded background, the chrome dots, the gutter and each
 * token's text, and turning the result into a PNG the visitor can download
 * or copy. The layout numbers themselves — gutter width, canvas size, which
 * lines are highlighted — come straight from that file so the two halves
 * never compute the same thing twice.
 */

const SAMPLE_CODE = `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("Camal"));
`;

const FONT_SIZE_PX = 14;
/* 1.5x the font size — a typical code-editor line-height ratio, named so it
   is not a bare number wherever it is used below. */
const LINE_HEIGHT_PX = Math.round(FONT_SIZE_PX * 1.5);
const LINE_NUMBER_GUTTER_PADDING_PX = 16;

const MIN_PADDING_PX = 0;
const MAX_PADDING_PX = 128;
const DEFAULT_PADDING_PX = 48;

const MIN_RADIUS_PX = 0;
const MAX_RADIUS_PX = 64;
const DEFAULT_RADIUS_PX = 16;

type BackgroundStyle = "solid" | "gradient";

const DEFAULT_BG_COLOR_1 = "#1e293b";
const DEFAULT_BG_COLOR_2 = "#0f172a";

/* Traffic-light convention colours — decorative only, they do not represent
   a close/minimise/maximise control the way they would on a real window. */
const CHROME_DOT_COLORS = ["#ff5f56", "#ffbd2e", "#27c93f"];
const CHROME_DOT_RADIUS_PX = 6;
const CHROME_DOT_GAP_PX = 8;

const DARK_THEMES = new Set<SupportedTheme>(["github-dark", "dracula", "nord"]);

/*
 * Resolves the site's own code-face web font by name instead of assuming a
 * `ctx.font` string — a bare `"16px monospace"` falls back to whatever
 * generic mono face the operating system ships, and on some systems that
 * fallback face is missing glyphs for letters this site has to support
 * (see the font-loading note in docs/IOS-DESIGN.md and the sibling tools'
 * canvas code for the class of bug this avoids). Reading the computed style
 * off an element that carries the site's own `font-mono` class, and waiting
 * for that exact face to finish loading, is what keeps text in a pasted
 * comment from silently breaking mid-draw.
 */
async function resolveMonoFontFamily(): Promise<string> {
  const probe = document.createElement("span");
  probe.className = "font-mono";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  document.body.removeChild(probe);
  try {
    await document.fonts.load(`${FONT_SIZE_PX}px ${family}`);
    await document.fonts.ready;
  } catch {
    // A font-loading failure should not block drawing — the browser still
    // has some fallback face, it just might not be the site's intended one.
  }
  return family;
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawChromeDots(ctx: CanvasRenderingContext2D, x: number, y: number, barHeight: number): void {
  const centerY = y + barHeight / 2;
  for (const [index, color] of CHROME_DOT_COLORS.entries()) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(
      x + CHROME_DOT_RADIUS_PX + index * (CHROME_DOT_RADIUS_PX * 2 + CHROME_DOT_GAP_PX),
      centerY,
      CHROME_DOT_RADIUS_PX,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

type DrawOptions = {
  tokens: HighlightedLine[];
  theme: SupportedTheme;
  fontFamily: string;
  showLineNumbers: boolean;
  showChrome: boolean;
  backgroundStyle: BackgroundStyle;
  bgColor1: string;
  bgColor2: string;
  padding: number;
  cornerRadius: number;
  highlightedLines: Set<number>;
};

/** Draws the whole image onto `canvas`, sizing it first from the same layout maths the check suite pins down. */
function drawCodeImage(canvas: HTMLCanvasElement, options: DrawOptions): void {
  const measureCtx = canvas.getContext("2d");
  if (!measureCtx) return;

  measureCtx.font = `${FONT_SIZE_PX}px ${options.fontFamily}`;
  // Monospace: any character's advance width stands in for all of them.
  const charWidth = measureCtx.measureText("0").width || FONT_SIZE_PX * 0.6;

  const lineCount = Math.max(1, options.tokens.length);
  const longestLineChars = Math.max(
    1,
    ...options.tokens.map((line) => line.reduce((sum, token) => sum + token.content.length, 0)),
  );
  const gutterWidth = options.showLineNumbers
    ? computeLineNumberGutterWidth(lineCount, charWidth, LINE_NUMBER_GUTTER_PADDING_PX)
    : 0;

  const { width, height } = computeCanvasDimensions({
    lineCount,
    longestLineChars,
    charWidth,
    lineHeight: LINE_HEIGHT_PX,
    fontSize: FONT_SIZE_PX,
    padding: options.padding,
    showLineNumbers: options.showLineNumbers,
    showChrome: options.showChrome,
    gutterWidth,
  });

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const isDark = DARK_THEMES.has(options.theme);
  const lineNumberColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const highlightWashColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";

  tracePath(ctx, 0, 0, width, height, options.cornerRadius);
  ctx.save();
  ctx.clip();

  if (options.backgroundStyle === "solid") {
    ctx.fillStyle = options.bgColor1;
    ctx.fillRect(0, 0, width, height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, options.bgColor1);
    gradient.addColorStop(1, options.bgColor2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  let contentTop = options.padding;
  if (options.showChrome) {
    drawChromeDots(ctx, options.padding, contentTop, CHROME_HEIGHT_PX);
    contentTop += CHROME_HEIGHT_PX;
  }

  ctx.font = `${FONT_SIZE_PX}px ${options.fontFamily}`;
  ctx.textBaseline = "top";

  const codeStartX = options.padding + gutterWidth;

  options.tokens.forEach((line, index) => {
    const lineNumber = index + 1;
    const y = contentTop + index * LINE_HEIGHT_PX;

    if (options.highlightedLines.has(lineNumber)) {
      ctx.fillStyle = highlightWashColor;
      ctx.fillRect(options.padding, y, width - options.padding * 2, LINE_HEIGHT_PX);
    }

    if (options.showLineNumbers) {
      ctx.fillStyle = lineNumberColor;
      ctx.textAlign = "right";
      ctx.fillText(String(lineNumber), codeStartX - LINE_NUMBER_GUTTER_PADDING_PX / 2, y);
      ctx.textAlign = "left";
    }

    let x = codeStartX;
    for (const token of line) {
      ctx.fillStyle = token.color;
      ctx.fillText(token.content, x, y);
      x += token.content.length * charWidth;
    }
  });

  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function KodSekilTool() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [lang, setLang] = useState<SupportedLang>("typescript");
  const [theme, setTheme] = useState<SupportedTheme>("github-dark");
  const [lineRangeSpec, setLineRangeSpec] = useState("");
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showChrome, setShowChrome] = useState(true);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>("gradient");
  const [bgColor1, setBgColor1] = useState(DEFAULT_BG_COLOR_1);
  const [bgColor2, setBgColor2] = useState(DEFAULT_BG_COLOR_2);
  const [padding, setPadding] = useState(DEFAULT_PADDING_PX);
  const [cornerRadius, setCornerRadius] = useState(DEFAULT_RADIUS_PX);

  const [fontFamily, setFontFamily] = useState<string | null>(null);
  const [tokens, setTokens] = useState<HighlightedLine[]>([]);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const highlightedLines = useMemo(() => parseLineRanges(lineRangeSpec), [lineRangeSpec]);

  // Resolve the site's loaded mono font once, up front — every draw below
  // waits for this instead of guessing a `ctx.font` string of its own.
  useEffect(() => {
    let cancelled = false;
    resolveMonoFontFamily().then((family) => {
      if (!cancelled) setFontFamily(family);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A settings change invalidates any tokenize already in flight for the old
  // code/lang/theme — otherwise a slow run can finish after a faster later
  // one and overwrite its result.
  const generationRef = useRef(0);
  useEffect(() => {
    generationRef.current += 1;
    const myGeneration = generationRef.current;
    highlightCode(code, lang, theme)
      .then((result) => {
        if (generationRef.current !== myGeneration) return;
        setTokens(result);
        setHighlightError(null);
      })
      .catch((error: unknown) => {
        if (generationRef.current !== myGeneration) return;
        setHighlightError(error instanceof Error ? error.message : "Naməlum xəta baş verdi.");
      });
  }, [code, lang, theme]);

  useEffect(() => {
    if (!fontFamily) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCodeImage(canvas, {
      tokens,
      theme,
      fontFamily,
      showLineNumbers,
      showChrome,
      backgroundStyle,
      bgColor1,
      bgColor2,
      padding,
      cornerRadius,
      highlightedLines,
    });
  }, [
    tokens,
    theme,
    fontFamily,
    showLineNumbers,
    showChrome,
    backgroundStyle,
    bgColor1,
    bgColor2,
    padding,
    cornerRadius,
    highlightedLines,
  ]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        setActionNote("PNG hazırlanmadı: brauzer bu kodlaşdırmanı dəstəkləmədi.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kod-sekli.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function handleCopy() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof window === "undefined" || !("ClipboardItem" in window) || !navigator.clipboard?.write) {
      setActionNote("Bu brauzer şəkli birbaşa panoya kopyalamağı dəstəkləmir, PNG kimi endir.");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setActionNote("Şəkil hazırlanmadı: panoya kopyalama alınmadı.");
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setActionNote("Şəkil panoya kopyalandı.");
      } catch {
        setActionNote("Panoya kopyalama alınmadı: brauzer icazə vermədi.");
      }
    }, "image/png");
  }

  const lineCount = code === "" ? 1 : code.split("\n").length;

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Kod şəkli"
          hint={`${lineCount} sətir`}
          action={
            <ToolButton
              size="chip"
              onClick={() => {
                setCode(SAMPLE_CODE);
                setLang("typescript");
                setTheme("github-dark");
                setLineRangeSpec("");
              }}
            >
              Nümunəni bərpa et
            </ToolButton>
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <ToolField label="Dil" htmlFor="kod-sekil-lang">
              <ToolSelect
                id="kod-sekil-lang"
                value={lang}
                onChange={(event) => setLang(event.target.value as SupportedLang)}
              >
                {SUPPORTED_LANGS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>

            <ToolField label="Tema" htmlFor="kod-sekil-theme">
              <ToolSelect
                id="kod-sekil-theme"
                value={theme}
                onChange={(event) => setTheme(event.target.value as SupportedTheme)}
              >
                {SUPPORTED_THEMES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </ToolSelect>
            </ToolField>

            <ToolField
              label="Vurğulanan sətirlər"
              hint="məs. 2,4-6"
              htmlFor="kod-sekil-lines"
            >
              <ToolInput
                id="kod-sekil-lines"
                type="text"
                inputMode="text"
                placeholder="boş: heç biri"
                value={lineRangeSpec}
                onChange={(event) => setLineRangeSpec(event.target.value)}
              />
            </ToolField>

            <ToolField label="Sətir nömrələri">
              <ToolSegmented
                label="Sətir nömrələri"
                options={[
                  { value: "on", label: "Var" },
                  { value: "off", label: "Yox" },
                ]}
                value={showLineNumbers ? "on" : "off"}
                onChange={(value) => setShowLineNumbers(value === "on")}
                fill
              />
            </ToolField>

            <ToolField label="Pəncərə çərçivəsi">
              <ToolSegmented
                label="Pəncərə çərçivəsi"
                options={[
                  { value: "on", label: "Var" },
                  { value: "off", label: "Yox" },
                ]}
                value={showChrome ? "on" : "off"}
                onChange={(value) => setShowChrome(value === "on")}
                fill
              />
            </ToolField>

            <ToolField label="Fon">
              <ToolSegmented
                label="Fon"
                options={[
                  { value: "solid", label: "Tək ton" },
                  { value: "gradient", label: "Qradiyent" },
                ]}
                value={backgroundStyle}
                onChange={setBackgroundStyle}
                fill
              />
            </ToolField>

            <div className="flex gap-3">
              <ToolField label={backgroundStyle === "gradient" ? "Rəng 1" : "Rəng"} htmlFor="kod-sekil-bg1">
                <input
                  id="kod-sekil-bg1"
                  type="color"
                  value={bgColor1}
                  onChange={(event) => setBgColor1(event.target.value)}
                  className="h-11 w-full cursor-pointer border border-rule bg-surface"
                />
              </ToolField>
              {backgroundStyle === "gradient" && (
                <ToolField label="Rəng 2" htmlFor="kod-sekil-bg2">
                  <input
                    id="kod-sekil-bg2"
                    type="color"
                    value={bgColor2}
                    onChange={(event) => setBgColor2(event.target.value)}
                    className="h-11 w-full cursor-pointer border border-rule bg-surface"
                  />
                </ToolField>
              )}
            </div>

            <div className="flex gap-3">
              <ToolField label="Padding" hint="piksel" htmlFor="kod-sekil-padding">
                <ToolInput
                  id="kod-sekil-padding"
                  type="number"
                  min={MIN_PADDING_PX}
                  max={MAX_PADDING_PX}
                  value={padding}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setPadding(clamp(Math.round(next), MIN_PADDING_PX, MAX_PADDING_PX));
                  }}
                />
              </ToolField>
              <ToolField label="Künc radiusu" hint="piksel" htmlFor="kod-sekil-radius">
                <ToolInput
                  id="kod-sekil-radius"
                  type="number"
                  min={MIN_RADIUS_PX}
                  max={MAX_RADIUS_PX}
                  value={cornerRadius}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isNaN(next)) return;
                    setCornerRadius(clamp(Math.round(next), MIN_RADIUS_PX, MAX_RADIUS_PX));
                  }}
                />
              </ToolField>
            </div>

            <ToolNote>
              Kod heç yerə göndərilmir: sintaksis vurğulanması və şəkil generasiyası tamamilə
              brauzerdə aparılır, dil və tema qrammatikaları artıq saytın öz JS-inə yığılıb.
            </ToolNote>

            {highlightError && <ToolNote tone="accent">{highlightError}</ToolNote>}
          </div>

          <div className="min-w-0 space-y-4">
            <ToolField label="Kod" htmlFor="kod-sekil-code">
              <ToolTextArea
                id="kod-sekil-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                rows={14}
                spellCheck={false}
              />
            </ToolField>

            <ToolResultPanel
              title="Nəticə"
              action={
                <>
                  <ToolButton size="chip" onClick={handleDownload}>
                    PNG endir
                  </ToolButton>
                  <ToolButton size="chip" onClick={handleCopy}>
                    Panoya kopyala
                  </ToolButton>
                </>
              }
            >
              <div className="overflow-auto p-3">
                <canvas
                  ref={canvasRef}
                  role="img"
                  aria-label="Generasiya olunmuş kod şəkli"
                  className="block max-w-full rounded border border-rule"
                />
              </div>
            </ToolResultPanel>

            {actionNote && <ToolNote tone="accent">{actionNote}</ToolNote>}
          </div>
        </div>
      </ToolPanel>
    </div>
  );
}
