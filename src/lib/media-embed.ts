/**
 * Detect a video URL and return an iframe src for the matching embed
 * surface. Covers YouTube, Vimeo, X/Twitter video pages, and Loom — the
 * four hosts that cover ~all in-house investigation clips and shared
 * breakdowns. Anything else returns null and the caller renders a plain
 * `<video>` tag (works for mp4 / webm hosted on our own CDN).
 *
 * Kept tiny on purpose: we don't want a generic oembed call on a hot path.
 */
export type VideoEmbed = {
  host: "youtube" | "vimeo" | "loom" | "twitter";
  src: string;
};

export function detectVideoEmbed(url: string): VideoEmbed | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");

    // YouTube — long, short, and shorts paths all map to the privacy-enhanced
    // embed domain. nocookie keeps GDPR-clean and matches our consent stance.
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
        return { host: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
      }
      const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/);
      if (shorts) {
        return { host: "youtube", src: `https://www.youtube-nocookie.com/embed/${shorts[1]}` };
      }
    }
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "");
      if (/^[A-Za-z0-9_-]{6,}$/.test(id)) {
        return { host: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}` };
      }
    }

    // Vimeo — match the canonical /<id> path and the /channels/.../<id> form.
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = u.pathname.match(/(\d{6,})/)?.[1];
      if (id) {
        return { host: "vimeo", src: `https://player.vimeo.com/video/${id}` };
      }
    }

    // Loom — investigation walkthroughs are almost always shared as loom links.
    if (host === "loom.com" || host === "www.loom.com") {
      const id = u.pathname.match(/\/share\/([A-Za-z0-9]{16,})/)?.[1];
      if (id) {
        return { host: "loom", src: `https://www.loom.com/embed/${id}` };
      }
    }

    // X / Twitter — link-to-tweet pages with video. We embed via the platform's
    // tweet card so the video, replies, and account context come along.
    if (host === "x.com" || host === "twitter.com") {
      const m = u.pathname.match(/^\/([^/]+)\/status\/(\d{6,})/);
      if (m) {
        return {
          host: "twitter",
          src: `https://platform.twitter.com/embed/Tweet.html?id=${m[2]}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true for hosts we trust enough to render inside an iframe on the
 * intel article surface. Submission validator already strips non-http(s)
 * URLs; this allowlist is the second gate for `kind: "embed"` media.
 */
export function isAllowedEmbedHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host === "youtube-nocookie.com" ||
      host === "vimeo.com" ||
      host === "player.vimeo.com" ||
      host === "loom.com" ||
      host === "platform.twitter.com" ||
      host === "x.com" ||
      host === "twitter.com" ||
      host === "open.spotify.com" ||
      host === "soundcloud.com" ||
      host === "w.soundcloud.com" ||
      host === "codepen.io" ||
      host === "gist.github.com" ||
      host === "embed.figma.com"
    );
  } catch {
    return false;
  }
}
