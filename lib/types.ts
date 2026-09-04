/*
 * The shape of a tool, kept apart from the list itself.
 *
 * The list used to own this type, and that was fine while every tool was
 * written inline in it. It stopped being fine when tools started arriving as
 * their own files: an entry importing `Tool` from the list, while the list
 * imports the entry, is a cycle. Types have no runtime, so the cycle is only
 * a problem in principle — but the file it forces open is the 400-line list,
 * every time, and that is a real cost. The type lives here instead.
 */
/*
 * One level: twelve groups, named after the subject a visitor arrives with.
 *
 * There used to be a verb layer above this — build, convert, check, look up —
 * and it was removed because it answered a question nobody asks. Somebody
 * arrives thinking "I need an SEO tool" or "I need something for DNS"; nobody
 * arrives thinking "I need a building tool". The verb was a shelf the visitor
 * had to translate their subject into before they could look for it.
 *
 * The subjects were already here as the second level, so the removal is a
 * promotion rather than a renaming: the keys, the labels and every tool's
 * `group` field are the ones that were written for the lower level.
 *
 * The group key never reaches a tool's URL, so regrouping a tool leaves its
 * slug, its route and its links alone. It does reach the category page's URL —
 * `/alet/kateqoriya/<group>` — so renaming a key is a redirect, not a refactor.
 */
export type ToolGroup =
  | "biznes"
  | "dizayn"
  | "sistem"
  | "format"
  | "kod"
  | "metn"
  | "fayl"
  | "seo"
  | "shebeke"
  | "tehlukesizlik"
  | "cedvel"
  | "ekosistem";

export type Tool = {
  slug: string;
  /** What the window's title bar and the desktop call it, lowercase. */
  name: string;
  title: string;
  description: string;
  /** The lead line under the H1, and the row summary on the index. */
  summary: string;
  /** One of the twelve categories. It is the tool's only taxonomy field. */
  group: ToolGroup;
  /** The service page this tool hands the visitor to, when there is one. */
  service?: string;
  /** Search phrases the page is written for. */
  keywords?: string[];
  /** Folded into the page under the tool, as a native <details> accordion. */
  faq?: { q: string; a: string }[];
  /**
   * Names the outside service this tool sends the visitor's input to.
   *
   * Absent means the honest claim every other tool makes on its page: the work
   * happens in the browser and nothing leaves it. Present means it does not,
   * and the page has to say so in the visitor's own language before they type
   * anything. Two tools that make opposite promises must not look alike, so
   * the promise is data rather than prose somebody has to remember to write.
   */
  network?: {
    /** Who is asked, named the way a visitor would recognise it. */
    upstream: string;
    /** What actually leaves the browser — precise, not reassuring. */
    sends: string;
  };
};
