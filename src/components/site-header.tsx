import Link from "next/link";
import { site, toolPath, tools } from "@/lib/site";

/**
 * 56px of chrome, held down by a hairline rather than a shadow. Planned tools
 * appear in the row but are plain text — a link to a page that does not exist
 * yet is the fastest way to lose the visitor.
 */
export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-(--container-page) items-center gap-5 px-5">
        <Link
          href="/"
          className="shrink-0 font-display text-[17px] text-ink transition-colors hover:text-accent-text"
        >
          {site.shortName}
        </Link>

        {/* min-w-0 keeps a long tool name from pushing camalali.com off a 390px
            screen; the planned entries only join in from md upwards. */}
        <nav className="flex min-w-0 items-center gap-5 overflow-hidden">
          {tools.map((tool) =>
            tool.status === "live" ? (
              <Link
                key={tool.slug}
                href={toolPath(tool.slug)}
                className="shrink-0 text-[13px] font-medium text-ink-muted transition-colors hover:text-accent-text"
              >
                {tool.name}
              </Link>
            ) : (
              <span
                key={tool.slug}
                className="hidden shrink-0 text-[13px] text-ink-faint md:inline"
              >
                {tool.name}
              </span>
            ),
          )}
        </nav>

        <a
          href={site.author.url}
          className="ml-auto shrink-0 text-[13px] text-ink-faint transition-colors hover:text-accent-text"
        >
          camalali.com
        </a>
      </div>
    </header>
  );
}
