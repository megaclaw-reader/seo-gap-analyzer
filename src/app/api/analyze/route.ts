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

// ── Stop words for relevance extraction ──
const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","is","it","this","that","was","are","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might","shall",
  "can","need","must","our","your","my","his","her","its","their","we","you",
  "they","he","she","i","me","him","us","them","what","which","who","whom",
  "how","when","where","why","all","each","every","both","few","more","most",
  "other","some","such","no","not","only","own","same","so","than","too","very",
  "just","about","above","after","again","also","am","any","because","before",
  "below","between","come","get","go","here","if","into","know","like","make",
  "many","much","new","now","off","one","over","see","since","still","take",
  "through","under","up","us","want","well","work","best","top","near","near me",
  "services","service","company","companies","business","professional","professionals",
  "cost","price","prices","pricing","free","cheap","affordable","review","reviews",
  "phone","number","hours","location","address","contact","call","online","local",
  "find","search","look","looking","help","www","com","http","https","org","net",
]);

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

// ── Website crawling for relevance profiling ──
async function crawlWebsite(domain: string): Promise<{ text: string; title: string; metaDesc: string; headings: string[] }> {
  const result = { text: "", title: "", metaDesc: "", headings: [] as string[] };
  
  try {
    const urls = [`https://www.${domain}`, `https://${domain}`];
    let html = "";
    
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MEGA-SEO-Analyzer/1.0)" },
          redirect: "follow",
        });
        if (res.ok) {
          html = await res.text();
          break;
        }
      } catch { continue; }
    }
    
    if (!html) return result;

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].replace(/\s+/g, " ").trim();

    // Extract meta description
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) 
      || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    if (metaMatch) result.metaDesc = metaMatch[1].replace(/\s+/g, " ").trim();

    // Extract headings (H1-H3)
    const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      const heading = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (heading.length > 2 && heading.length < 200) result.headings.push(heading);
    }

    // Extract visible text (strip tags, scripts, styles)
    let bodyHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "");
    bodyHtml = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    // Decode HTML entities
    bodyHtml = bodyHtml.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    result.text = bodyHtml.trim().substring(0, 10000); // cap at 10k chars

    console.log(`[Crawl] ${domain}: title="${result.title.substring(0, 80)}", ${result.headings.length} headings, ${result.text.length} chars`);
  } catch (err) {
    console.error(`[Crawl] Failed for ${domain}:`, err);
  }
  
  return result;
}

// ── Build relevance profile from site content + existing keywords ──
function buildRelevanceProfile(
  siteData: { text: string; title: string; metaDesc: string; headings: string[] },
  currentKeywords: Keyword[]
): { topicTerms: Set<string>; topicBigrams: Set<string>; brandTerms: Set<string> } {
  // Combine all text sources
  const allText = [
    siteData.title,
    siteData.metaDesc,
    ...siteData.headings,
    siteData.text,
    ...currentKeywords.map(k => k.keyword),
  ].join(" ").toLowerCase();

  // Extract meaningful terms (frequency-weighted)
  const termCounts = new Map<string, number>();
  const words = allText.split(/[^a-z0-9'-]+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  
  for (const word of words) {
    termCounts.set(word, (termCounts.get(word) || 0) + 1);
  }

  // Get top terms by frequency (these define what the business does)
  const sortedTerms = [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([term]) => term);
  
  const topicTerms = new Set(sortedTerms);

  // Build bigrams from headings + title + meta (more specific phrases)
  const importantText = [siteData.title, siteData.metaDesc, ...siteData.headings, ...currentKeywords.map(k => k.keyword)].join(" ").toLowerCase();
  const importantWords = importantText.split(/[^a-z0-9'-]+/).filter(w => w.length > 1);
  const topicBigrams = new Set<string>();
  for (let i = 0; i < importantWords.length - 1; i++) {
    const bigram = `${importantWords[i]} ${importantWords[i + 1]}`;
    if (!STOP_WORDS.has(importantWords[i]) || !STOP_WORDS.has(importantWords[i + 1])) {
      topicBigrams.add(bigram);
    }
  }

  // Brand terms to filter out (from competitor domains + target site)
  const brandTerms = new Set<string>();

  console.log(`[Relevance] ${topicTerms.size} topic terms, ${topicBigrams.size} bigrams`);
  return { topicTerms, topicBigrams, brandTerms };
}

// ── Check if a keyword is relevant to the business ──
function isRelevantKeyword(
  keyword: string,
  profile: { topicTerms: Set<string>; topicBigrams: Set<string>; brandTerms: Set<string> },
  competitorDomains: string[],
  targetDomain: string
): boolean {
  const kwLower = keyword.toLowerCase();
  const kwWords = kwLower.split(/[^a-z0-9'-]+/).filter(w => w.length > 1);

  // Filter out branded keywords (competitor names or any domain-like terms)
  const allDomains = [...competitorDomains, targetDomain];
  for (const dom of allDomains) {
    const brand = dom.replace(/\.(com|net|org|io|co|us|law|legal|biz|info)$/i, "").replace(/[^a-z0-9]/g, "");
    if (brand.length > 2 && kwLower.includes(brand)) return false;
  }

  // Filter out generic brand patterns: keywords that look like company names
  // (single capitalized proper nouns that aren't service terms)
  if (/^[a-z]+ (law|legal|group|firm|associates|llc|inc|llp|pllc)$/i.test(kwLower)) {
    // This is likely a branded firm name — only keep if it matches target
    const targetBrand = targetDomain.replace(/\.(com|net|org|io|co|us|law|legal|biz|info)$/i, "").replace(/[^a-z0-9]/g, "");
    if (!kwLower.includes(targetBrand)) return false;
  }

  // Check relevance: does the keyword relate to what the business does?
  // A keyword is relevant if it shares meaningful terms with the site's topic profile
  let relevanceScore = 0;
  
  for (const word of kwWords) {
    if (profile.topicTerms.has(word) && !STOP_WORDS.has(word)) {
      relevanceScore += 1;
    }
  }
  
  // Check bigram matches (stronger signal)
  for (let i = 0; i < kwWords.length - 1; i++) {
    const bigram = `${kwWords[i]} ${kwWords[i + 1]}`;
    if (profile.topicBigrams.has(bigram)) {
      relevanceScore += 2;
    }
  }

  // Require at least 1 topic-relevant term for short keywords, 
  // or proportional relevance for longer ones
  const threshold = kwWords.length <= 2 ? 1 : Math.ceil(kwWords.filter(w => !STOP_WORDS.has(w)).length * 0.3);
  
  return relevanceScore >= Math.max(1, threshold);
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
    // Step 1: Crawl target website + get organic data in parallel
    const [siteData, organicRows, competitorRows] = await Promise.all([
      crawlWebsite(domain),
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

    // Step 4: Build relevance profile and filter keywords
    const relevanceProfile = buildRelevanceProfile(siteData, currentKeywords);
    
    // Add competitor brand names to filter
    for (const comp of competitors) {
      const brand = comp.replace(/\.(com|net|org|io|co|us|law|legal|biz|info)$/i, "").replace(/[^a-z0-9]/g, "");
      if (brand.length > 2) relevanceProfile.brandTerms.add(brand);
    }

    // Filter: only keep keywords relevant to the business, remove branded
    const unfilteredCount = gapMap.size;
    for (const [kw, gapKw] of gapMap) {
      if (!isRelevantKeyword(gapKw.keyword, relevanceProfile, competitors, domain)) {
        gapMap.delete(kw);
      }
    }
    console.log(`[Filter] ${unfilteredCount} → ${gapMap.size} keywords after relevance filtering (removed ${unfilteredCount - gapMap.size})`);

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
