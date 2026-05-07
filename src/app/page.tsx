"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const cleanDomain = (input: string) => {
    return input.trim()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cleanDomain(domain);
    if (!clean) return;
    setLoading(true);
    router.push(`/results/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 flex flex-col">
      <div className="flex items-center justify-center flex-1 px-4">
        <div className="w-full max-w-2xl text-center">
          {/* Logo */}
          <div className="mb-8">
            <svg viewBox="0 -0.5 56 20.5" className="h-10 mx-auto mb-6">
              <path d="M 52.483 5.276 L 52.483 3.883 L 56 3.883 L 56 15.303 L 52.483 15.303 L 52.483 13.909 L 52.391 13.909 C 51.706 14.892 50.45 15.645 48.874 15.645 C 45.882 15.645 43.598 13.247 43.598 9.638 C 43.598 6.121 45.745 3.54 48.874 3.54 C 50.45 3.54 51.706 4.294 52.391 5.276 Z M 49.833 12.311 C 51.409 12.311 52.483 11.077 52.483 9.593 C 52.483 8.04 51.364 6.875 49.833 6.875 C 48.326 6.875 47.184 7.994 47.184 9.593 C 47.184 11.191 48.326 12.311 49.833 12.311 Z M 39.613 5.276 L 39.613 3.883 L 43.131 3.883 L 43.131 16.513 C 43.131 18.683 41.852 19.871 39.659 19.871 L 32.236 19.871 L 32.236 16.308 L 38.791 16.308 C 39.271 16.308 39.613 16.034 39.613 15.577 L 39.613 13.909 L 39.522 13.909 C 38.837 14.892 37.58 15.645 36.005 15.645 C 33.013 15.645 30.729 13.247 30.729 9.638 C 30.729 6.121 32.876 3.54 36.005 3.54 C 37.58 3.54 38.837 4.294 39.522 5.276 Z M 36.964 12.311 C 38.54 12.311 39.613 11.077 39.613 9.593 C 39.613 8.04 38.494 6.875 36.964 6.875 C 35.456 6.875 34.314 7.994 34.314 9.593 C 34.314 11.191 35.456 12.311 36.964 12.311 Z M 24.352 3.54 C 28.166 3.54 30.61 6.601 30.153 10.758 L 21.931 10.758 C 22.159 11.625 22.913 12.402 24.238 12.516 C 25.106 12.585 26.042 12.219 26.408 11.648 L 30.085 11.648 C 29.354 14.252 27.001 15.645 24.284 15.645 C 20.378 15.645 18.368 12.79 18.368 9.593 C 18.368 6.167 20.835 3.54 24.352 3.54 Z M 24.329 6.646 C 23.187 6.646 22.296 7.217 21.977 8.131 L 26.659 8.131 C 26.339 7.172 25.448 6.646 24.329 6.646 Z M 17.609 0 L 17.609 15.303 L 13.841 15.303 L 13.841 5.573 L 9.89 15.303 L 7.72 15.303 L 3.769 5.573 L 3.769 15.303 L 0 15.303 L 0 0 L 5.23 0 L 8.816 9.09 L 12.425 0 Z" fill="#2563EB" />
            </svg>
          </div>

          <h1 className="text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
            SEO Gap Analyzer
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-lg mx-auto leading-relaxed">
            Find high-value keywords your competitors rank for — that you don&apos;t.
            See exactly how much traffic you&apos;re leaving on the table.
          </p>

          <form onSubmit={handleSubmit} className="flex gap-3 max-w-xl mx-auto">
            <div className="flex-1 relative">
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="Enter a domain or URL (e.g. acmeplumbing.com)"
                className="w-full px-5 py-4 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg shadow-sm"
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !domain.trim()}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl transition-colors text-lg whitespace-nowrap shadow-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing
                </span>
              ) : "Analyze"}
            </button>
          </form>

          <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto text-center">
            <div>
              <div className="text-2xl mb-1">🔍</div>
              <p className="text-sm text-gray-500">Keyword gaps vs competitors</p>
            </div>
            <div>
              <div className="text-2xl mb-1">📈</div>
              <p className="text-sm text-gray-500">Traffic uplift projections</p>
            </div>
            <div>
              <div className="text-2xl mb-1">💰</div>
              <p className="text-sm text-gray-500">Traffic value estimates</p>
            </div>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-sm text-gray-400">
        Powered by <span className="font-semibold text-blue-600">MEGA AI</span> · gomega.ai
      </footer>
    </div>
  );
}
