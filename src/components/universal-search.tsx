import Link from "next/link";

export function UniversalSearch() {
  return (
    <>
      {/* Desktop: inline form. Hidden on small screens to keep the nav from
         wrapping; mobile users get the icon link below. */}
      <form
        method="get"
        action="/search"
        className="hidden md:flex items-center gap-1.5"
        role="search"
      >
        <input
          type="search"
          name="q"
          placeholder="Search the field…"
          aria-label="Search events, jobs, hackathons, grants"
          className="rex-input"
          style={{
            width: 200,
            padding: "0.4rem 0.65rem",
            fontSize: 12,
            letterSpacing: "0.04em",
          }}
        />
        <button
          type="submit"
          aria-label="Search"
          className="rex-btn"
          style={{
            padding: "0.45rem 0.7rem",
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          ▸
        </button>
      </form>

      {/* Mobile fallback: dedicated search page link. */}
      <Link
        href="/search"
        aria-label="Search"
        className="md:hidden hover:text-white transition-colors"
        style={{ color: "var(--rex-text-dim)" }}
      >
        ⌕
      </Link>
    </>
  );
}
