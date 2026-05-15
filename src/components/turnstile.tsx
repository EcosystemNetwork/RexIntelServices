"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget. Renders the challenge iframe and emits the
 * resulting token via `onToken`. Reads the public site key from
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY at build time — if unset, the component
 * returns null (zero-render) so forms work fine in local dev.
 *
 * Theme matches the rest of the site (dark). `size="flexible"` lets the
 * widget shrink on narrow viewports.
 *
 * The Cloudflare script is loaded once on first mount and shared across
 * widgets via the global `window.turnstile`.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact" | "invisible";
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";

// Promise that resolves when window.turnstile becomes available. First call
// injects the script; subsequent calls just await the same promise.
let scriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    window.onTurnstileLoad = () => resolve();
    if (document.getElementById(SCRIPT_ID)) return; // already in DOM
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({
  onToken,
  className,
}: {
  onToken: (token: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      await loadTurnstileScript();
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "dark",
        size: "flexible",
        callback: (token) => onToken(token),
        // Treat expiry + error the same — clear the token so the submit
        // button knows to refuse the request until the user re-solves.
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    })();

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // siteKey is build-time-constant; onToken is captured fresh each render
    // via the closure. Re-mounting on prop changes would double-render the
    // widget, so we keep the dependency list empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!siteKey) return null;
  return <div ref={containerRef} className={className} />;
}
