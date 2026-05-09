"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center hero-gradient relative overflow-hidden px-4">
      {/* Decorative glow */}
      <div className="glow-orb" style={{ top: "-200px", left: "50%", transform: "translateX(-50%)" }} />

      <div className="rex-modal animate-fade-in relative z-10" style={{ maxWidth: "400px" }}>
        <div className="flex items-center gap-2.5 mb-6">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: "linear-gradient(135deg, var(--rex-accent), var(--rex-accent-2))" }}
          >
            R
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-white">
            Rex Intel Services
          </span>
        </div>

        <h1 className="font-display text-3xl font-medium text-white mb-1">
          Welcome back
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--rex-text-muted)" }}>
          Sign in to your command center.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-xs font-medium uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rex-input"
              id="login-email"
            />
          </div>
          <div>
            <label
              className="block text-xs font-medium uppercase tracking-wider mb-1.5"
              style={{ color: "var(--rex-text-muted)" }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rex-input"
              id="login-password"
            />
          </div>

          {error && (
            <div
              className="text-sm px-3 py-2 rounded-lg"
              style={{
                color: "var(--rex-danger)",
                background: "rgba(248,113,113,0.1)",
                border: "1px solid rgba(248,113,113,0.2)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rex-btn w-full"
            id="login-submit"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in…
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
