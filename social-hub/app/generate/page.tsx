"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

interface GeneratedPosts {
  linkedin?: string;
  twitter?: string;
  instagram?: string;
}

const TONES = [
  { value: "professional", label: "💼 Professional & Analytical" },
  { value: "hype", label: "🔥 Hype / Launch Mode" },
  { value: "creative", label: "🎨 Creative & Storyteller" },
  { value: "casual", label: "☕ Casual & Friendly" },
];

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GeneratedPosts | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, tone }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Something went wrong.");
      }

      setResults((await response.json()) as GeneratedPosts);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during creation.");
    } finally {
      setLoading(false);
    }
  }

  const panels: { key: keyof GeneratedPosts; title: string; accent: string }[] = [
    { key: "linkedin", title: "LinkedIn Copy", accent: "text-indigo-600" },
    { key: "twitter", title: "Twitter / X Copy", accent: "text-sky-600" },
    { key: "instagram", title: "Instagram Caption", accent: "text-pink-600" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              Social Hub
            </Link>
            <Link href="/dashboard" className="text-sm text-black/60 hover:underline">
              Dashboard
            </Link>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">AI Copy Generator</h1>
          <p className="text-sm text-black/60">
            Draft optimized, platform-specific copy with Gemini, then publish it from the
            dashboard.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <section>
            <form onSubmit={handleGenerate} className="card space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Campaign subject / topic</label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., An educational breakdown comparing PostgreSQL and Supabase"
                  rows={4}
                  required
                  className="w-full rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Tone of voice</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-accent"
                >
                  {TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? "Generating…" : "Generate copy"}
              </button>
            </form>
          </section>

          <section className="space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {!results && !loading && !error && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-black/10 p-12 text-center text-black/40">
                <p className="text-sm">No copy generated yet.</p>
                <p className="mt-1 text-xs text-black/30">
                  Provide a topic and click generate.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-2xl border border-black/10 p-12 text-black/50">
                <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-accent" />
                <p className="text-sm">Contacting Gemini…</p>
              </div>
            )}

            {results &&
              panels.map(({ key, title, accent }) =>
                results[key] ? (
                  <div key={key} className="card">
                    <div className="mb-2 flex items-center justify-between border-b border-black/10 pb-2">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>
                        {title}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(results[key] || "")}
                        className="text-xs text-black/50 hover:text-black"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap text-sm text-black/80 font-sans leading-relaxed">
                      {results[key]}
                    </pre>
                  </div>
                ) : null
              )}
          </section>
        </div>
      </main>
    </div>
  );
}
