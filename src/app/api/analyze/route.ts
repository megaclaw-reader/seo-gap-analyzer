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

// ── Words to IGNORE when determining what a keyword is actually about ──
// These are location terms, generic profession words, and filler — they don't tell us the SERVICE
const NOISE_WORDS = new Set([
  // Standard stop words
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
  "through","under","up","us","want","well","work",
  // Generic profession/business terms (don't differentiate service type)
  "lawyer","lawyers","attorney","attorneys","law","legal","firm","firms",
  "group","associates","llc","inc","llp","pllc","pc","pa","esq",
  "office","offices","practice","practices","consultant","consultants",
  "agency","agencies","doctor","doctors","dr","clinic","clinics",
  "specialist","specialists","expert","experts","pro","pros",
  "services","service","company","companies","business","professional","professionals",
  "provider","providers","contractor","contractors","shop","store",
  // Generic modifiers
  "best","top","near","nearby","me","good","great","affordable","cheap","free",
  "cost","price","prices","pricing","rated","trusted","experienced","certified",
  "licensed","local","area","region","county","state","city","town",
  // Web/search noise
  "review","reviews","phone","number","hours","location","address","contact",
  "call","online","find","search","look","looking","help","hire","hiring",
  "www","com","http","https","org","net",
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

// ── US state names/abbreviations and common city names to strip from keywords ──
const LOCATION_WORDS = new Set([
  // State abbreviations
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id","il","ia",
  "ks","ky","la","ma","md","me","mi","mn","mo","ms","mt","nc","nd","ne",
  "nh","nj","nm","nv","ny","oh","ok","pa","ri","sc","sd","tn","tx",
  "ut","va","vt","wa","wi","wv","wy","dc","or","in",
  // Full state names (common ones)
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada","hampshire",
  "jersey","mexico","york","carolina","dakota","ohio","oklahoma","oregon",
  "pennsylvania","rhode","island","tennessee","texas","utah","vermont","virginia",
  "washington","wisconsin","wyoming",
]);

// ── Crawl the target website ──
async function crawlWebsite(domain: string): Promise<{ text: string; title: string; metaDesc: string; headings: string[]; links: string[] }> {
  const result = { text: "", title: "", metaDesc: "", headings: [] as string[], links: [] as string[] };
  
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

    // Extract internal link text and hrefs (tells us what pages/services exist)
    const linkRegex = /<a[^>]*href=["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (href.includes(domain) || href.startsWith("/")) {
        if (text.length > 2 && text.length < 100) result.links.push(text);
        // Also extract meaningful path segments
        const pathParts = href.replace(/^https?:\/\/[^/]+/, "").split("/").filter(Boolean);
        for (const part of pathParts) {
          const clean = part.replace(/[-_]/g, " ").replace(/\.(html|php|aspx?)$/i, "").trim();
          if (clean.length > 2) result.links.push(clean);
        }
      }
    }

    // Extract visible text (strip tags, scripts, styles)
    let bodyHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");
    bodyHtml = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    bodyHtml = bodyHtml.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
    result.text = bodyHtml.trim().substring(0, 15000);

    console.log(`[Crawl] ${domain}: title="${result.title.substring(0, 80)}", ${result.headings.length} headings, ${result.links.length} links, ${result.text.length} chars body`);
  } catch (err) {
    console.error(`[Crawl] Failed for ${domain}:`, err);
  }
  
  return result;
}

// ── Extract SERVICE terms from text (strip noise/location/generic words) ──
function extractServiceTerms(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9'-]+/).filter(w => w.length > 2);
  const terms = new Set<string>();
  for (const w of words) {
    if (!NOISE_WORDS.has(w) && !LOCATION_WORDS.has(w)) {
      terms.add(w);
    }
  }
  return terms;
}

// ── Build service profile: what does this business ACTUALLY do? ──
function buildServiceProfile(
  siteData: { text: string; title: string; metaDesc: string; headings: string[]; links: string[] },
  currentKeywords: Keyword[],
  domain: string
): Set<string> {
  // Only use STRONG-ranking keywords (top 30) — weak rankings (50+) are often irrelevant
  const strongKeywords = currentKeywords.filter(k => k.position !== null && k.position <= 30);
  
  // Extract LOCATION words from the site (city names, neighborhoods)
  // Look for "City, ST" or "City, State" patterns in title, meta, headings
  const siteLocationWords = new Set<string>();
  const stateAbbrPattern = "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY";
  const cityPattern = new RegExp(`([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s*[,|]\\s*(?:${stateAbbrPattern})\\b`, "g");
  
  const locationSources = [siteData.title, siteData.metaDesc, ...siteData.headings];
  for (const text of locationSources) {
    let match;
    while ((match = cityPattern.exec(text)) !== null) {
      for (const w of match[1].toLowerCase().split(/\s+/)) {
        if (w.length > 2 && !NOISE_WORDS.has(w)) {
          siteLocationWords.add(w);
        }
      }
    }
  }
  
  // Extract the TARGET BUSINESS brand name from title and domain
  // These words identify the business itself — not what they DO
  const brandWords = new Set<string>();
  
  // From domain: "elevatecig.com" → "elevatecig", "elevate", "cig"
  const domainBase = domain.replace(/\.(com|net|org|io|co|us|law|legal|biz|info|ai|app)$/i, "").replace(/^www\./, "");
  brandWords.add(domainBase.toLowerCase());
  // Split camelCase/compound domain names
  const domainParts = domainBase.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z]+/).filter(w => w.length > 2);
  for (const p of domainParts) brandWords.add(p);
  
  // From title: extract business name
  // Titles are usually "Business Name | Description | Location" or "Description | Business Name | Location"
  // The business name part typically matches the domain name
  const titleParts = siteData.title.split(/[|–—\-:•]/).map(p => p.trim()).filter(Boolean);
  const domainLower = domainBase.toLowerCase();
  for (const part of titleParts) {
    const partLower = part.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Check if this title segment matches or overlaps with the domain name
    if (partLower.includes(domainLower) || domainLower.includes(partLower) || 
        // Also check word overlap: if >50% of part words appear in domain
        part.toLowerCase().split(/\s+/).filter(w => domainLower.includes(w) && w.length > 2).length >= 
        Math.ceil(part.split(/\s+/).length * 0.5)) {
      const bizWords = part.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !NOISE_WORDS.has(w) && !LOCATION_WORDS.has(w));
      for (const w of bizWords) brandWords.add(w);
    }
  }
  
  console.log(`[ServiceProfile] Detected brand words: ${[...brandWords].join(", ")}`);
  console.log(`[ServiceProfile] Detected site location words: ${[...siteLocationWords].join(", ")}`);
  
  // Combine all text that describes the business
  const allText = [
    siteData.title, siteData.title, siteData.title,
    siteData.metaDesc, siteData.metaDesc, siteData.metaDesc,
    ...siteData.headings, ...siteData.headings,
    ...siteData.links,
    siteData.text,
    ...strongKeywords.map(k => k.keyword),
    ...strongKeywords.map(k => k.keyword),
  ].join(" ");

  // Extract service terms, stripping location + brand words
  const words = allText.toLowerCase().split(/[^a-z0-9'-]+/).filter(w => w.length > 2);
  const serviceTerms = new Set<string>();
  for (const w of words) {
    if (!NOISE_WORDS.has(w) && !LOCATION_WORDS.has(w) && !siteLocationWords.has(w) && !brandWords.has(w)) {
      serviceTerms.add(w);
    }
  }
  
  // Attach metadata so the keyword filter can use them
  (serviceTerms as any).__siteLocationWords = siteLocationWords;
  (serviceTerms as any).__brandWords = brandWords;
  
  console.log(`[ServiceProfile] ${serviceTerms.size} service terms. Sample: ${[...serviceTerms].slice(0, 20).join(", ")}`);
  return serviceTerms;
}

// ── Check if a keyword is relevant to the business ──
function isRelevantKeyword(
  keyword: string,
  serviceTerms: Set<string>,
  competitorDomains: string[],
  targetDomain: string
): { relevant: boolean; reason?: string } {
  const kwLower = keyword.toLowerCase();
  const kwWords = kwLower.split(/[^a-z0-9'-]+/).filter(w => w.length > 1);

  // ── FILTER 1: Branded keywords (competitor/other firm names) ──
  // Check if keyword contains a competitor's brand name
  for (const dom of competitorDomains) {
    const brand = dom.replace(/\.(com|net|org|io|co|us|law|legal|biz|info|gov)$/i, "")
      .replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (brand.length > 3 && kwLower.replace(/\s+/g, "").includes(brand)) {
      return { relevant: false, reason: `branded:${dom}` };
    }
  }
  
  // Check if it looks like a brand name: "[word] law group", "[word] & [word]", etc.
  if (/^[a-z]+\s+(law|legal|group|firm|associates|llc|inc|llp|pllc)(\s|$)/i.test(kwLower) ||
      /^(the\s+)?[a-z]+\s+(law|legal)\s+(group|firm|office)/i.test(kwLower) ||
      /^[a-z]+\s+&\s+[a-z]+/i.test(kwLower) ||
      /^[a-z]+\s+[a-z]+\s+(law|legal|group|firm|associates|llc|inc|llp|pllc)$/i.test(kwLower)) {
    // It's a brand pattern — only keep if it's the target's own brand
    const targetBrand = targetDomain.replace(/\.(com|net|org|io|co|us|law|legal|biz|info)$/i, "")
      .replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!kwLower.replace(/\s+/g, "").includes(targetBrand)) {
      return { relevant: false, reason: "branded:pattern" };
    }
  }

  // ── FILTER 1.5: Target brand keywords ──
  // ANY keyword containing the business's own brand name is branded — not a real opportunity
  // "elevate property management" = someone searching for THAT company, not a gap
  const targetBrandWords: Set<string> = (serviceTerms as any).__brandWords || new Set();
  for (const bw of targetBrandWords) {
    if (bw.length > 3 && kwLower.includes(bw)) {
      return { relevant: false, reason: `branded:self:${bw}` };
    }
  }

  // ── FILTER 2: Service relevance ──
  // Extract the SERVICE-SPECIFIC words from this keyword (strip noise + location + brand)
  const siteLocationWords: Set<string> = (serviceTerms as any).__siteLocationWords || new Set();
  const kwServiceWords: string[] = [];
  for (const w of kwWords) {
    if (!NOISE_WORDS.has(w) && !LOCATION_WORDS.has(w) && !siteLocationWords.has(w) && !targetBrandWords.has(w) && w.length > 2) {
      kwServiceWords.push(w);
    }
  }

  // If keyword has NO service-specific words after stripping (e.g. "lawyer near me nj"),
  // it's too generic but not harmful — let it through
  if (kwServiceWords.length === 0) {
    return { relevant: true, reason: "generic-pass" };
  }

  // Check: do ANY of the keyword's service words appear in the site's service profile?
  let matchCount = 0;
  for (const w of kwServiceWords) {
    if (serviceTerms.has(w)) {
      matchCount++;
    }
  }

  // Require at least ONE service word to match the site
  if (matchCount === 0) {
    return { relevant: false, reason: `service-mismatch:[${kwServiceWords.join(",")}]` };
  }

  return { relevant: true };
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

    // Step 4: Build service profile and filter keywords
    const serviceTerms = buildServiceProfile(siteData, currentKeywords, domain);

    // Filter: only keep keywords relevant to the business, remove branded
    const unfilteredCount = gapMap.size;
    const filterReasons = new Map<string, number>();
    for (const [kw, gapKw] of gapMap) {
      const { relevant, reason } = isRelevantKeyword(gapKw.keyword, serviceTerms, competitors, domain);
      if (!relevant) {
        gapMap.delete(kw);
        const cat = reason?.split(":")[0] || "unknown";
        filterReasons.set(cat, (filterReasons.get(cat) || 0) + 1);
        console.log(`[Filter] REMOVED "${gapKw.keyword}" → ${reason}`);
      }
    }
    console.log(`[Filter] ${unfilteredCount} → ${gapMap.size} keywords (removed ${unfilteredCount - gapMap.size}: ${[...filterReasons.entries()].map(([k,v]) => `${k}=${v}`).join(", ")})`);

    // Sort by value (volume × cpc) descending
    const gaps = Array.from(gapMap.values()).sort((a, b) => b.volume * b.cpc - a.volume * a.cpc);

    const quickWins = gaps.filter((g) => g.category === "quick_wins");
    const growth = gaps.filter((g) => g.category === "growth");
    const newTerritory = gaps.filter((g) => g.category === "new_territory");

    const totalUplift = gaps.reduce((s, g) => s + g.uplift, 0);
    const totalValue = gaps.reduce((s, g) => s + g.uplift * g.cpc, 0);

    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    };

    return NextResponse.json({
      domain,
      competitors,
      siteProfile: {
        title: siteData.title.substring(0, 100),
        metaDescription: siteData.metaDesc.substring(0, 200),
        serviceTermsDetected: serviceTerms.size,
        keywordsFiltered: unfilteredCount - gapMap.size,
        filterBreakdown: Object.fromEntries(filterReasons),
      },
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
    }, { headers });
  } catch (err: unknown) {
    console.error("Analysis error:", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
