"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "../shared/copy-button";
import { ToolField, ToolInput, ToolOutput, ToolPanel, ToolPanelHeader, ToolTextArea } from "./ui";
import { ToolTabs, type ToolTabItem } from "./tabs";
import { generateTypesFromJson } from "../lib/json-tip";

const SAMPLE_JSON = `{
  "id": 42,
  "name": "Kamran",
  "email": "kamran@example.az",
  "isActive": true,
  "manager": null,
  "tags": ["editor", "admin"],
  "address": { "city": "Bakı", "zip": "AZ1000" }
}`;

export function JsonTipTool() {
  const [jsonText, setJsonText] = useState(SAMPLE_JSON);
  const [rootName, setRootName] = useState("Root");

  const generated = useMemo(() => generateTypesFromJson(jsonText, rootName), [jsonText, rootName]);

  const tabs: ToolTabItem[] = generated.ok
    ? [
        { id: "ts", label: "TypeScript", content: <ToolOutput>{generated.result.typescript}</ToolOutput> },
        { id: "zod", label: "Zod", content: <ToolOutput>{generated.result.zod}</ToolOutput> },
        { id: "go", label: "Go", content: <ToolOutput>{generated.result.go}</ToolOutput> },
        { id: "py-td", label: "Python (TypedDict)", content: <ToolOutput>{generated.result.pythonTypedDict}</ToolOutput> },
        { id: "py-dc", label: "Python (dataclass)", content: <ToolOutput>{generated.result.pythonDataclass}</ToolOutput> },
      ]
    : [];

  return (
    <div className="mt-8 space-y-5">
      <ToolPanel>
        <ToolPanelHeader title="Nümunə JSON" action={<CopyButton value={jsonText} label="JSON kopyala" />} />
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[2fr_1fr]">
          <ToolField label="Nümunə" htmlFor="json-tip-input">
            <ToolTextArea id="json-tip-input" value={jsonText} onChange={(event) => setJsonText(event.target.value)} rows={10} spellCheck={false} />
          </ToolField>
          <ToolField label="Kök tipin adı" htmlFor="json-tip-root" note="Boş buraxsan «Root» işlədilir.">
            <ToolInput id="json-tip-root" value={rootName} onChange={(event) => setRootName(event.target.value)} placeholder="Root" />
          </ToolField>
        </div>
      </ToolPanel>

      {!generated.ok && (
        <ToolPanel>
          <div className="p-4 text-ios-subhead text-accent-text">{generated.error}</div>
        </ToolPanel>
      )}

      {generated.ok && (
        <ToolPanel>
          <ToolPanelHeader title="Çıxan tip" />
          <div className="p-4">
            <ToolTabs idPrefix="json-tip" items={tabs} />
          </div>
        </ToolPanel>
      )}
    </div>
  );
}
