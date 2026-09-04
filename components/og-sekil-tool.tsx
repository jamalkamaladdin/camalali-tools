"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ToolSegmented } from "./tabs";
import {
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolTextArea,
} from "./ui";
import {
  buildOgFilename,
  fitTextToBox,
  gradientEndpoints,
  OG_PRESETS,
  ogPresetById,
  type MeasureFn,
  type OgPresetId,
} from "../lib/og-sekil";

/*
 * A live canvas preview with no upload anywhere. `og-sekil.ts` holds the
 * wrap/shrink-to-fit maths and the gradient trigonometry; everything below
 * that touches `CanvasRenderingContext2D`, `document.fonts` or `Image` has
 * to live here, because none of it exists on the server that renders this
 * page's static parts.
 */

type BackgroundMode = "solid" | "gradient";

const DEFAULT_TITLE = "Salam! Bu sənin paylaşım şəklinin başlığıdır";
const DEFAULT_SUBTITLE = "Alt başlıq buraya yazılır";
const DEFAULT_SITE_NAME = "camalali.com";
const DEFAULT_COLOR_1 = "#0b1220";
const DEFAULT_COLOR_2 = "#2b3a67";
const DEFAULT_TEXT_COLOR = "#f5f7fa";

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Loqo açılmadı — fayl zədəli və ya format dəstəklənmir."));
    image.src = src;
  });
}

export function OgSekilTool() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const logoUrlRef = useRef<string | null>(null);

  const [presetId, setPresetId] = useState<OgPresetId>("og");
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [subtitle, setSubtitle] = useState(DEFAULT_SUBTITLE);
  const [siteName, setSiteName] = useState(DEFAULT_SITE_NAME);
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("gradient");
  const [color1, setColor1] = useState(DEFAULT_COLOR_1);
  const [color2, setColor2] = useState(DEFAULT_COLOR_2);
  const [angle, setAngle] = useState(135);
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [overflowWarning, setOverflowWarning] = useState(false);

  useEffect(
    () => () => {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    },
    [],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preset = ogPresetById(presetId);
    canvas.width = preset.width;
    canvas.height = preset.height;

    const context = canvas.getContext("2d");
    if (!context) return;

    // The site's own body font is already the Azerbaijani-safe web font this
    // project settled on — reading it live avoids hardcoding a family name
    // here that could drift out of step with the actual `next/font` setup.
    const fontFamily = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

    if (backgroundMode === "gradient") {
      const { x0, y0, x1, y1 } = gradientEndpoints(preset.width, preset.height, angle);
      const gradient = context.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      context.fillStyle = gradient;
    } else {
      context.fillStyle = color1;
    }
    context.fillRect(0, 0, preset.width, preset.height);

    const paddingX = Math.round(preset.width * 0.08);
    const paddingY = Math.round(preset.height * 0.1);
    const boxWidth = preset.width - paddingX * 2;

    const measureBold: MeasureFn = (text, fontSize) => {
      context.font = `700 ${fontSize}px ${fontFamily}`;
      return context.measureText(text).width;
    };

    const reservedBottom = (subtitle.trim() !== "" ? preset.height * 0.11 : 0) + preset.height * 0.14;
    const titleBoxHeight = Math.max(1, preset.height - paddingY * 2 - reservedBottom);

    const fit = fitTextToBox(
      title.trim() === "" ? " " : title,
      { width: boxWidth, height: titleBoxHeight },
      measureBold,
      { maxFontSize: Math.round(preset.height * 0.14), minFontSize: 26 },
    );
    setOverflowWarning(fit.overflowed);

    context.fillStyle = textColor;
    context.textBaseline = "alphabetic";
    context.font = `700 ${fit.fontSize}px ${fontFamily}`;
    let y = paddingY + fit.fontSize;
    for (const line of fit.lines) {
      context.fillText(line, paddingX, y);
      y += fit.lineHeight;
    }

    if (subtitle.trim() !== "") {
      const subtitleSize = Math.max(16, Math.round(fit.fontSize * 0.42));
      context.font = `400 ${subtitleSize}px ${fontFamily}`;
      context.fillText(subtitle, paddingX, y + subtitleSize * 0.6);
    }

    const logo = logoRef.current;
    const logoSize = logo ? Math.round(preset.height * 0.11) : 0;

    if (siteName.trim() !== "") {
      const siteSize = Math.max(14, Math.round(preset.height * 0.032));
      context.font = `600 ${siteSize}px ${fontFamily}`;
      context.fillText(siteName.trim().toUpperCase(), paddingX + (logo ? logoSize + 14 : 0), preset.height - paddingY);
    }

    if (logo) {
      context.drawImage(
        logo,
        paddingX,
        preset.height - paddingY - logoSize * 0.78,
        logoSize,
        logoSize,
      );
    }
  }, [presetId, title, subtitle, siteName, backgroundMode, color1, color2, angle, textColor]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (typeof document !== "undefined" && "fonts" in document) {
        try {
          await document.fonts.ready;
        } catch {
          // A font-loading failure is not fatal — the fallback in the stack still draws readable text.
        }
      }
      if (!cancelled) draw();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [draw]);

  function onLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Bu fayl şəkil deyil.");
      return;
    }
    setLogoError(null);
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    const url = URL.createObjectURL(file);
    logoUrlRef.current = url;
    loadImageElement(url)
      .then((image) => {
        logoRef.current = image;
        setLogoName(file.name);
        draw();
      })
      .catch((error: unknown) => {
        setLogoError(error instanceof Error ? error.message : "Loqo açılmadı.");
      });
  }

  function removeLogo() {
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    logoUrlRef.current = null;
    logoRef.current = null;
    setLogoName(null);
    draw();
  }

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildOgFilename(presetId);
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const preset = ogPresetById(presetId);

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader
          title="Mətn"
          action={
            <ToolSegmented
              label="Ölçü"
              options={OG_PRESETS.map((p) => ({ value: p.id, label: p.label.split(" ")[0] }))}
              value={presetId}
              onChange={setPresetId}
            />
          }
        />

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-4">
            <ToolField label="Başlıq" htmlFor="og-title">
              <ToolTextArea
                id="og-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                rows={3}
              />
            </ToolField>

            <ToolField label="Alt başlıq" htmlFor="og-subtitle">
              <ToolInput
                id="og-subtitle"
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
              />
            </ToolField>

            <ToolField label="Sayt adı" htmlFor="og-sitename">
              <ToolInput
                id="og-sitename"
                value={siteName}
                onChange={(event) => setSiteName(event.target.value)}
              />
            </ToolField>

            {overflowWarning && (
              <ToolNote tone="accent" title="Mətn sığmır">
                Başlıq minimum şrift ölçüsündə də ayrılmış sahəyə sığmadı — bir hissəsi kəsilə bilər.
                Mətni qısalt və ya alt başlığı boş burax.
              </ToolNote>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 font-ui text-xs text-muted">
                Loqo
                <input type="file" accept="image/*" onChange={onLogoChange} className="text-xs" />
              </label>
              {logoName && (
                <ToolButton size="chip" onClick={removeLogo}>
                  Loqonu sil ({logoName})
                </ToolButton>
              )}
            </div>
            {logoError && <ToolNote tone="accent">{logoError}</ToolNote>}
          </div>

          <div className="space-y-4">
            <ToolSegmented
              label="Fon"
              options={[
                { value: "solid", label: "Düz rəng" },
                { value: "gradient", label: "Qradient" },
              ]}
              value={backgroundMode}
              onChange={setBackgroundMode}
              fill
            />

            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Fon 1
                <ColorSwatch value={color1} onChange={setColor1} label="Birinci fon rəngi" />
              </label>
              {backgroundMode === "gradient" && (
                <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                  Fon 2
                  <ColorSwatch value={color2} onChange={setColor2} label="İkinci fon rəngi" />
                </label>
              )}
              <label className="flex items-center gap-1.5 font-ui text-xs text-muted">
                Mətn
                <ColorSwatch value={textColor} onChange={setTextColor} label="Mətn rəngi" />
              </label>
            </div>

            {backgroundMode === "gradient" && (
              <ToolField label="Qradientin bucağı" hint={`${angle}°`} htmlFor="og-angle">
                <input
                  id="og-angle"
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(event) => setAngle(Number(event.target.value))}
                  className="w-full accent-[var(--color-accent)]"
                />
              </ToolField>
            )}
          </div>
        </div>
      </ToolPanel>

      <ToolResultPanel
        title="Önizləmə"
        hint={`${preset.width}×${preset.height}`}
        action={<ToolButton onClick={downloadPng}>PNG endir</ToolButton>}
      >
        <div className="p-4">
          <canvas
            ref={canvasRef}
            className="mx-auto block h-auto w-full max-w-2xl rounded border border-result-rule"
            style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
          />
        </div>
      </ToolResultPanel>

      <ToolNote>
        Mətn heç yerə göndərilmir — şəklin bütün qurulması brauzerin öz canvas-ında aparılır, bu
        səhifə heç bir sorğu göndərmir.
      </ToolNote>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      type="color"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-11 cursor-pointer border bg-surface p-0.5"
      style={{
        borderColor: "var(--field-border, var(--btn-border))",
        borderRadius: "var(--field-radius, var(--btn-radius))",
      }}
    />
  );
}
