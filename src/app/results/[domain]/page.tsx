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

function SortableTable({ keywords, title, description, color }: { keywords: GapKeyword[]; title: string; description: string; color: string }) {
  const [sortBy, setSortBy] = useState<SortKey>("uplift");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <span className={`inline-block w-3 h-3 rounded-full ${color}`} />
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">({keywords.length})</span>
      </div>
      <p className="text-sm text-gray-500 mb-3">{description}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Keyword</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort("position")}>Position{arrow("position")}</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort("volume")}>Volume{arrow("volume")}</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort("cpc")}>CPC{arrow("cpc")}</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 cursor-pointer select-none" onClick={() => toggleSort("uplift")}>Est. Uplift{arrow("uplift")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((kw, i) => (
              <tr key={kw.keyword} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-4 py-2.5 font-medium text-gray-900">{kw.keyword}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{kw.position ?? "—"}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{kw.volume.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">${kw.cpc.toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-green-600">+{kw.uplift.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams();
  const domain = decodeURIComponent(params.domain as string);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Analyzing {domain}</h2>
          <p className="text-gray-500">Scanning organic keywords, competitors, and gap opportunities...</p>
          <div className="mt-6 space-y-2 text-sm text-gray-400">
            <p>⏱ This typically takes 10–20 seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[85vh]">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">{error}</p>
          <Link href="/" className="text-blue-600 hover:underline">← Try another domain</Link>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const s = data.summary;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/" className="text-sm text-blue-600 hover:underline mb-1 inline-block">← New Analysis</Link>
          <h1 className="text-3xl font-bold text-gray-900">SEO Gap Analysis</h1>
          <p className="text-lg text-gray-500 mt-1">{data.domain}</p>
        </div>
        <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">MEGA AI</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Keyword Opportunities</p>
          <p className="text-3xl font-bold text-gray-900">{s.totalOpportunities.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">{s.quickWinsCount} quick wins · {s.growthCount} growth · {s.newTerritoryCount} new</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Est. Monthly Traffic Uplift</p>
          <p className="text-3xl font-bold text-green-600">+{s.estimatedMonthlyUplift.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">additional visits if ranked in top 3</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Est. Monthly Traffic Value</p>
          <p className="text-3xl font-bold text-blue-600">${s.estimatedMonthlyValue.toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">based on avg CPC of gap keywords</p>
        </div>
      </div>

      {/* Competitors */}
      {data.competitors.length > 0 && (
        <div className="mb-8 bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Top Organic Competitors</h3>
          <div className="flex flex-wrap gap-2">
            {data.competitors.map((c) => (
              <span key={c} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Current Keywords */}
      {data.currentKeywords.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Current Top Organic Keywords ({data.totalCurrentKeywords})</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">Keyword</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Position</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Volume</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">CPC</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">Traffic %</th>
                </tr>
              </thead>
              <tbody>
                {data.currentKeywords.map((kw, i) => (
                  <tr key={kw.keyword} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{kw.keyword}</td>
                    <td className="px-4 py-2.5 text-right"><span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${kw.position && kw.position <= 3 ? "bg-green-100 text-green-700" : kw.position && kw.position <= 10 ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"}`}>{kw.position}</span></td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{kw.volume.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">${kw.cpc.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{kw.trafficPercent.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gap Keywords */}
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Keyword Gap Opportunities</h2>
      <SortableTable keywords={data.gaps.quickWins} title="Quick Wins" description="Currently ranking 11-20 — small push to page 1" color="bg-green-500" />
      <SortableTable keywords={data.gaps.growth} title="Growth Opportunities" description="Currently ranking 21-50 — achievable with focused effort" color="bg-yellow-500" />
      <SortableTable keywords={data.gaps.newTerritory} title="New Territory" description="Competitors rank for these, you don't — untapped potential" color="bg-blue-500" />

      {s.totalOpportunities === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No significant keyword gaps found for this domain.</p>
          <p className="text-sm mt-2">This could mean the domain has strong coverage or limited competitor data.</p>
        </div>
      )}
    </div>
  );
}
