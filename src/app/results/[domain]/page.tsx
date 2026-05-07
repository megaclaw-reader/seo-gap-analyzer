"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface GapKeyword {
  keyword: string;
  position: number | null;
  volume: number;
  cpc: number;
  competition: number;
  category: string;
  uplift: number;
  projectedTraffic: number;
}

interface CurrentKeyword {
  keyword: string;
  position: number | null;
  volume: number;
  cpc: number;
  url: string;
  trafficPercent: number;
}

interface AnalysisData {
  domain: string;
  competitors: string[];
  currentKeywords: CurrentKeyword[];
  totalCurrentKeywords: number;
  gaps: {
    quickWins: GapKeyword[];
    growth: GapKeyword[];
    newTerritory: GapKeyword[];
  };
  summary: {
    totalOpportunities: number;
    quickWinsCount: number;
    growthCount: number;
    newTerritoryCount: number;
    estimatedMonthlyUplift: number;
    estimatedMonthlyValue: number;
  };
  error?: string;
}

type SortKey = "volume" | "cpc" | "uplift" | "position";

function SortableTable({ keywords, title, description, color, icon }: { keywords: GapKeyword[]; title: string; description: string; color: string; icon: string }) {
  const [sortBy, setSortBy] = useState<SortKey>("uplift");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
  };

  const sorted = [...keywords].sort((a, b) => {
    const av = a[sortBy] ?? 999;
    const bv = b[sortBy] ?? 999;
    return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
  });

  const arrow = (key: SortKey) => sortBy === key ? (sortDir === "desc" ? " ↓" : " ↑") : "";
  if (keywords.length === 0) return null;

  const totalUplift = keywords.reduce((s, k) => s + k.uplift, 0);
  const totalValue = keywords.reduce((s, k) => s + k.uplift * k.cpc, 0);

  return (
    <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-lg ${color}`}>{icon}</span>
          <div className="text-left">
            <h3 className="text-lg font-bold text-gray-900">{title} <span className="text-gray-400 font-normal text-sm">({keywords.length})</span></h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-sm text-gray-500">Potential uplift</p>
            <p className="font-bold text-green-600">+{totalUplift.toLocaleString()} visits</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm text-gray-500">Traffic value</p>
            <p className="font-bold text-blue-600">${Math.round(totalValue).toLocaleString()}/mo</p>
          </div>
          <span className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Keyword</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("position")}>Current Rank{arrow("position")}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("volume")}>Monthly Volume{arrow("volume")}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("cpc")}>CPC{arrow("cpc")}</th>
                <th className="text-right px-6 py-3 font-semibold text-gray-600 cursor-pointer select-none hover:text-blue-600" onClick={() => toggleSort("uplift")}>Est. Traffic Uplift{arrow("uplift")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 25).map((kw, i) => (
                <tr key={kw.keyword} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/50 transition-colors`}>
                  <td className="px-6 py-3 font-medium text-gray-900">{kw.keyword}</td>
                  <td className="px-4 py-3 text-right">
                    {kw.position ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">#{kw.position}</span>
                    ) : (
                      <span className="text-gray-400">Not ranking</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{kw.volume.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-600">${kw.cpc.toFixed(2)}</td>
                  <td className="px-6 py-3 text-right">
                    <span className="font-bold text-green-600">+{kw.uplift.toLocaleString()}</span>
                    <span className="text-gray-400 text-xs ml-1">visits/mo</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length > 25 && (
            <div className="px-6 py-3 text-center text-sm text-gray-500 border-t border-gray-100">
              Showing top 25 of {sorted.length} keywords
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const domain = decodeURIComponent(params.domain as string);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingStep, setLoadingStep] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze?domain=${encodeURIComponent(domain)}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch {
      setError("Failed to analyze domain. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Animate loading steps
  useEffect(() => {
    if (!loading) return;
    const steps = [0, 1, 2, 3];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % steps.length;
      setLoadingStep(steps[i]);
    }, 3000);
    return () => clearInterval(interval);
  }, [loading]);

  const loadingSteps = [
    { icon: "🔍", text: "Scanning organic keywords..." },
    { icon: "🏢", text: "Identifying top competitors..." },
    { icon: "📊", text: "Analyzing keyword gaps..." },
    { icon: "📈", text: "Calculating traffic potential..." },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="text-center max-w-md">
          <div className="inline-block w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing {domain}</h2>
          <div className="space-y-3 mt-8">
            {loadingSteps.map((step, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-500 ${
                i <= loadingStep ? 'bg-blue-50 text-gray-900' : 'text-gray-400'
              }`}>
                <span className="text-lg">{step.icon}</span>
                <span className="text-sm">{step.text}</span>
                {i < loadingStep && <span className="ml-auto text-green-500">✓</span>}
                {i === loadingStep && <span className="ml-auto w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="text-center bg-white rounded-xl border border-red-200 p-8 max-w-md shadow-sm">
          <span className="text-4xl mb-4 block">⚠️</span>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Analysis Failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
            ← Try Another Domain
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const s = data.summary;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/" className="text-sm text-blue-600 hover:underline mb-1 inline-block">← New Analysis</Link>
              <h1 className="text-2xl font-bold text-gray-900">SEO Gap Analysis</h1>
              <p className="text-lg text-gray-500">{data.domain}</p>
            </div>
            <svg viewBox="0 -0.5 56 20.5" className="h-8">
              <path d="M 52.483 5.276 L 52.483 3.883 L 56 3.883 L 56 15.303 L 52.483 15.303 L 52.483 13.909 L 52.391 13.909 C 51.706 14.892 50.45 15.645 48.874 15.645 C 45.882 15.645 43.598 13.247 43.598 9.638 C 43.598 6.121 45.745 3.54 48.874 3.54 C 50.45 3.54 51.706 4.294 52.391 5.276 Z M 49.833 12.311 C 51.409 12.311 52.483 11.077 52.483 9.593 C 52.483 8.04 51.364 6.875 49.833 6.875 C 48.326 6.875 47.184 7.994 47.184 9.593 C 47.184 11.191 48.326 12.311 49.833 12.311 Z M 39.613 5.276 L 39.613 3.883 L 43.131 3.883 L 43.131 16.513 C 43.131 18.683 41.852 19.871 39.659 19.871 L 32.236 19.871 L 32.236 16.308 L 38.791 16.308 C 39.271 16.308 39.613 16.034 39.613 15.577 L 39.613 13.909 L 39.522 13.909 C 38.837 14.892 37.58 15.645 36.005 15.645 C 33.013 15.645 30.729 13.247 30.729 9.638 C 30.729 6.121 32.876 3.54 36.005 3.54 C 37.58 3.54 38.837 4.294 39.522 5.276 Z M 36.964 12.311 C 38.54 12.311 39.613 11.077 39.613 9.593 C 39.613 8.04 38.494 6.875 36.964 6.875 C 35.456 6.875 34.314 7.994 34.314 9.593 C 34.314 11.191 35.456 12.311 36.964 12.311 Z M 24.352 3.54 C 28.166 3.54 30.61 6.601 30.153 10.758 L 21.931 10.758 C 22.159 11.625 22.913 12.402 24.238 12.516 C 25.106 12.585 26.042 12.219 26.408 11.648 L 30.085 11.648 C 29.354 14.252 27.001 15.645 24.284 15.645 C 20.378 15.645 18.368 12.79 18.368 9.593 C 18.368 6.167 20.835 3.54 24.352 3.54 Z M 24.329 6.646 C 23.187 6.646 22.296 7.217 21.977 8.131 L 26.659 8.131 C 26.339 7.172 25.448 6.646 24.329 6.646 Z M 17.609 0 L 17.609 15.303 L 13.841 15.303 L 13.841 5.573 L 9.89 15.303 L 7.72 15.303 L 3.769 5.573 L 3.769 15.303 L 0 15.303 L 0 0 L 5.23 0 L 8.816 9.09 L 12.425 0 Z" fill="#2563EB" />
            </svg>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Keywords Tracked</p>
            <p className="text-3xl font-bold text-gray-900">{data.totalCurrentKeywords}</p>
            <p className="text-xs text-gray-400 mt-1">currently ranking in top 100</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <p className="text-sm text-gray-500 mb-1">Keyword Opportunities</p>
            <p className="text-3xl font-bold text-gray-900">{s.totalOpportunities.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">
              {s.quickWinsCount} quick wins · {s.growthCount} growth · {s.newTerritoryCount} new
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-blue-200 shadow-sm bg-blue-50/30">
            <p className="text-sm text-gray-500 mb-1">Est. Traffic Uplift</p>
            <p className="text-3xl font-bold text-green-600">+{s.estimatedMonthlyUplift.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">additional visits/month if ranked top 3</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-blue-200 shadow-sm bg-blue-50/30">
            <p className="text-sm text-gray-500 mb-1">Est. Traffic Value</p>
            <p className="text-3xl font-bold text-blue-600">${s.estimatedMonthlyValue.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-1">monthly value based on CPC</p>
          </div>
        </div>

        {/* Competitors */}
        {data.competitors.length > 0 && (
          <div className="mb-8 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Top Organic Competitors Analyzed</h3>
            <div className="flex flex-wrap gap-2">
              {data.competitors.map((c) => (
                <span key={c} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Current Top Keywords */}
        {data.currentKeywords.length > 0 && (
          <div className="mb-8 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Current Top Organic Keywords</h3>
              <p className="text-sm text-gray-500">Top {data.currentKeywords.length} of {data.totalCurrentKeywords} tracked keywords by traffic share</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 font-semibold text-gray-600">Keyword</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Position</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Volume</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">CPC</th>
                    <th className="text-right px-6 py-3 font-semibold text-gray-600">Traffic Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.currentKeywords.map((kw, i) => (
                    <tr key={kw.keyword} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-blue-50/50 transition-colors`}>
                      <td className="px-6 py-3 font-medium text-gray-900">{kw.keyword}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          kw.position && kw.position <= 3 ? "bg-green-100 text-green-700" :
                          kw.position && kw.position <= 10 ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>#{kw.position}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 font-medium">{kw.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-600">${kw.cpc.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-gray-600">{kw.trafficPercent.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gap Keyword Tables */}
        {s.totalOpportunities > 0 && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Keyword Gap Opportunities</h2>
              <p className="text-gray-500 mt-1">Keywords your competitors rank for that represent untapped growth potential</p>
            </div>

            <SortableTable
              keywords={data.gaps.quickWins}
              title="Quick Wins"
              description="Currently ranking 11-20 — a focused push gets these to page 1"
              color="bg-green-100"
              icon="🎯"
            />
            <SortableTable
              keywords={data.gaps.growth}
              title="Growth Opportunities"
              description="Currently ranking 21-50 — achievable with dedicated SEO effort"
              color="bg-yellow-100"
              icon="📈"
            />
            <SortableTable
              keywords={data.gaps.newTerritory}
              title="New Territory"
              description="Your competitors rank here but you don't — completely untapped potential"
              color="bg-blue-100"
              icon="🚀"
            />
          </>
        )}

        {s.totalOpportunities === 0 && data.totalCurrentKeywords === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
            <span className="text-5xl mb-4 block">🔎</span>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No SEO Data Found</h3>
            <p className="text-gray-500 max-w-md mx-auto mb-6">
              This domain doesn&apos;t have enough organic search data in SEMRush. This usually means the site is very new, has minimal organic traffic, or the domain was entered incorrectly.
            </p>
            <Link href="/" className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
              ← Try Another Domain
            </Link>
          </div>
        )}

        {/* CTA */}
        {s.totalOpportunities > 0 && (
          <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-8 text-center text-white">
            <h3 className="text-2xl font-bold mb-2">Ready to capture this traffic?</h3>
            <p className="text-blue-100 mb-6 max-w-lg mx-auto">
              Our AI-powered SEO agents work 24/7 to get you ranking for these high-value keywords — producing 20-25 optimized pages per month.
            </p>
            <a href="https://www.gomega.ai" target="_blank" rel="noopener noreferrer" className="inline-block px-8 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition-colors">
              Learn More About MEGA AI
            </a>
          </div>
        )}
      </div>

      <footer className="py-6 text-center text-sm text-gray-400 border-t border-gray-200 mt-8">
        Powered by <span className="font-semibold text-blue-600">MEGA AI</span> · gomega.ai
      </footer>
    </div>
  );
}
