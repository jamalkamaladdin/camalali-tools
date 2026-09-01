import Link from "next/link";
import { liveTools, site, toolPath } from "@/lib/site";

export function SiteHeader() {
  const shown = liveTools();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-(--container-page) items-center gap-6 px-5">
        <Link
          href="/"
          className="text-[15px] font-semibold tracking-[-0.01em] text-ink"
        >
          Alətlər
        </Link>

        <nav className="hidden items-center gap-5 sm:flex">
          {shown.map((tool) => (
            <Link
              key={tool.slug}
              href={toolPath(tool.slug)}
              className="text-[14px] font-medium text-ink-muted transition-colors hover:text-accent"
            >
              {tool.name}
            </Link>
          ))}
        </nav>

        <a
          href={site.author.url}
          className="ml-auto text-[14px] font-medium text-ink-muted transition-colors hover:text-accent"
        >
          camalali.com
        </a>
      </div>
    </header>
  );
}
