"use client";

import { ReferenceTable } from "./reference-table";
import { wifiStandartlariRows, wifiStandartlariSections } from "../lib/wifi-standartlari";

export function WifiStandartlariTool() {
  return (
    <ReferenceTable
      rows={wifiStandartlariRows}
      sections={wifiStandartlariSections}
      placeholder="axtar: Wi-Fi 6, WPA3, DFS, RSSI..."
      footnote="Mənbə IEEE 802.11 düzəlişləri və Wi-Fi Alliance-ın öz sertifikasiya materiallarıdır. Nəzəri PHY rəqəmi ilə real ötürmə ayrıca göstərilir; kanal siyahısı Avropa/Azərbaycan tənzimləməsinə görədir, hər ölkənin öz məhdudiyyəti ola bilər."
    />
  );
}
