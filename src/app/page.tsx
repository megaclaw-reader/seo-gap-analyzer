"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;
    const clean = domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
    setLoading(true);
    router.push(`/results/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="flex items-center justify-center min-h-[85vh] px-4">
      <div className="w-full max-w-lg text-center">
        <div className="mb-2">
          <span className="inline-block bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">MEGA AI</span>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-3">SEO Gap Analyzer</h1>
        <p className="text-gray-500 mb-8 text-lg">Discover high-value keyword opportunities your competitors rank for — but you don&apos;t.</p>
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="Enter a domain (e.g. acmeplumbing.com)"
            className="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !domain.trim()}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg transition-colors text-lg whitespace-nowrap"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </form>
      </div>
    </div>
  );
}
