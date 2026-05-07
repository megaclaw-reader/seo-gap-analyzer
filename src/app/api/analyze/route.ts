import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.SEMRUSH_API_KEY!;
const BASE = "https://api.semrush.com/";

interface Keyword {
  keyword: string;
  position: number | null;
  volume: number;
  cpc: number;
  competition: number;
  url: string;
  trafficPercent: number;
  difficulty: number;
}

interface GapKeyword extends Keyword {
  category: "quick_wins" | "growth" | "new_territory";
  currentTraffic: number;
  projectedTraffic: number;
  uplift: number;
}

function parseSemrushCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const vals = line.split(";");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h.trim()] = (vals[i] || "").trim()));
    return obj;
  });
}

async function semrushFetch(params: Record<string, string>): Promise<Record<string, string>[]> {
  const url = new URL(BASE);
  url.searchParams.set("key", API_KEY);
  url.searchParams.set("database", "us");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  console.log(`[SEMRush] Fetching: type=${params.type} domain=${params.domain || 'n/a'}`);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (text.startsWith("ERROR") || text.startsWith("Validation")) {
    console.error(`[SEMRush] Error for type=${params.type}: ${text.substring(0, 200)}`);
    return [];
  }
  const rows = parseSemrushCsv(text);
  console.log(`[SEMRush] type=${params.type} returned ${rows.length} rows`);
  return rows;
}

function ctrAtPosition(pos: number): number {
  if (pos === 1) return 0.28;
  if (pos === 2) return 0.15;
  if (pos === 3) return 0.11;
  if (pos <= 5) return 0.06;
  if (pos <= 10) return 0.03;
  if (pos <= 20) return 0.01;
  return 0.005;
}

export async function GET(req: NextRequest) {
  let domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  // Clean domain: strip protocol, www, paths, query strings
  domain = domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();

  if (!API_KEY) {
    console.error("SEMRUSH_API_KEY not set");
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    // Step 1: Get current organic keywords
    const [organicRows, competitorRows] = await Promise.all([
      semrushFetch({
        type: "domain_organic",
        domain,
        export_columns: "Ph,Po,Nq,Cp,Ur,Tr,Tc,Co,Nr",
        display_limit: "100",
        display_sort: "tr_desc",
      }),
      semrushFetch({
        type: "domain_organic_organic",
        domain,
        export_columns: "Dn,Cr,Np,Or,Ot,Oc,Ad",
        display_limit: "5",
      }),
    ]);

    const currentKeywords: Keyword[] = organicRows.map((r) => ({
      keyword: r["Ph"] || r["Keyword"],
      position: parseInt(r["Po"] || r["Position"]) || null,
      volume: parseInt(r["Nq"] || r["Search Volume"]) || 0,
      cpc: parseFloat(r["Cp"] || r["CPC"]) || 0,
      competition: parseFloat(r["Co"] || r["Competition"]) || 0,
      url: r["Ur"] || r["Url"] || "",
      trafficPercent: parseFloat(r["Tr"] || r["Traffic (%)"]) || 0,
      difficulty: parseFloat(r["Kd"] || "0") || 0,
    }));

    const currentKeywordSet = new Map<string, Keyword>();
    currentKeywords.forEach((k) => currentKeywordSet.set(k.keyword.toLowerCase(), k));

    // Step 2: Get competitor keywords
    const competitors = competitorRows.slice(0, 3).map((r) => r["Dn"] || r["Domain"]);
    const competitorKeywordArrays = await Promise.all(
      competitors.map((comp) =>
        semrushFetch({
          type: "domain_organic",
          domain: comp,
          export_columns: "Ph,Po,Nq,Cp,Ur,Tr,Tc,Co,Nr",
          display_limit: "100",
          display_sort: "tr_desc",
        })
      )
    );

    // Step 3: Find gaps
    const gapMap = new Map<string, GapKeyword>();

    for (const rows of competitorKeywordArrays) {
      for (const r of rows) {
        const kw = (r["Ph"] || r["Keyword"] || "").toLowerCase();
        if (!kw || gapMap.has(kw)) continue;

        const volume = parseInt(r["Nq"] || r["Search Volume"]) || 0;
        const cpc = parseFloat(r["Cp"] || r["CPC"]) || 0;
        const existing = currentKeywordSet.get(kw);

        // Only gaps: not ranking or ranking poorly (11+)
        if (existing && existing.position !== null && existing.position <= 10) continue;

        const currentPos = existing?.position ?? null;
        let category: GapKeyword["category"];
        if (currentPos !== null && currentPos >= 11 && currentPos <= 20) category = "quick_wins";
        else if (currentPos !== null && currentPos >= 21 && currentPos <= 50) category = "growth";
        else category = "new_territory";

        const currentTraffic = currentPos ? volume * ctrAtPosition(currentPos) : 0;
        const projectedTraffic = volume * 0.11; // position 3
        const uplift = Math.round(projectedTraffic - currentTraffic);

        if (volume < 10) continue; // skip very low volume

        gapMap.set(kw, {
          keyword: r["Ph"] || r["Keyword"],
          position: currentPos,
          volume,
          cpc,
          competition: parseFloat(r["Co"] || r["Competition"]) || 0,
          url: existing?.url || "",
          trafficPercent: 0,
          difficulty: 0,
          category,
          currentTraffic: Math.round(currentTraffic),
          projectedTraffic: Math.round(projectedTraffic),
          uplift,
        });
      }
    }

    // Sort by value (volume × cpc) descending
    const gaps = Array.from(gapMap.values()).sort((a, b) => b.volume * b.cpc - a.volume * a.cpc);

    const quickWins = gaps.filter((g) => g.category === "quick_wins");
    const growth = gaps.filter((g) => g.category === "growth");
    const newTerritory = gaps.filter((g) => g.category === "new_territory");

    const totalUplift = gaps.reduce((s, g) => s + g.uplift, 0);
    const totalValue = gaps.reduce((s, g) => s + g.uplift * g.cpc, 0);

    return NextResponse.json({
      domain,
      competitors,
      currentKeywords: currentKeywords.slice(0, 20),
      totalCurrentKeywords: currentKeywords.length,
      gaps: {
        quickWins: quickWins.slice(0, 50),
        growth: growth.slice(0, 50),
        newTerritory: newTerritory.slice(0, 50),
      },
      summary: {
        totalOpportunities: gaps.length,
        quickWinsCount: quickWins.length,
        growthCount: growth.length,
        newTerritoryCount: newTerritory.length,
        estimatedMonthlyUplift: totalUplift,
        estimatedMonthlyValue: Math.round(totalValue * 100) / 100,
      },
    });
  } catch (err: unknown) {
    console.error("Analysis error:", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
