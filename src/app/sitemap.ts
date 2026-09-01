import type { MetadataRoute } from "next";
import { liveTools, site, toolUrl } from "@/lib/site";

// Required by `output: "export"` — this route is emitted at build time.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: `${site.url}/`, lastModified: now, priority: 1 },
    ...liveTools().map((tool) => ({
      url: toolUrl(tool.slug),
      lastModified: now,
      priority: 0.9,
    })),
  ];
}
