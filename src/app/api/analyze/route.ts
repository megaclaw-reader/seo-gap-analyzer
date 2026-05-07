import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.SEMRUSH_API_KEY!;
const BASE = "https://api.semrush.com/";

interface GapKeyword {
  keyword: string;
  position: number | null;
  volume: number;
  cpc: number;
  competition: number;
  difficulty: number;
  category: "quick_wins" | "growth" | "new_territory";
  currentTraffic: number;
  projectedTraffic: number;
  uplift: number;
  url: string;
  trafficPercent: number;
  seed: string; // which seed phrase generated this
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

  const label = params.type + (params.domain ? `:${params.domain}` : "") + (params.phrase ? `:${params.phrase.substring(0, 30)}` : "");
  console.log(`[SEMRush] ${label}`);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  if (text.startsWith("ERROR") || text.startsWith("Validation")) {
    if (!text.includes("NOTHING FOUND")) console.error(`[SEMRush] Error: ${text.substring(0, 200)}`);
    return [];
  }
  const rows = parseSemrushCsv(text);
  console.log(`[SEMRush] ${label} → ${rows.length} rows`);
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

// ── Crawl the target website to understand the business ──
async function crawlWebsite(domain: string): Promise<{
  title: string; metaDesc: string; headings: string[]; links: string[];
  services: string[]; location: { city: string; state: string; stateAbbr: string } | null;
  businessName: string;
}> {
  const result = {
    title: "", metaDesc: "", headings: [] as string[], links: [] as string[],
    services: [] as string[], location: null as { city: string; state: string; stateAbbr: string } | null,
    businessName: "",
  };

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
        if (res.ok) { html = await res.text(); break; }
      } catch { continue; }
    }
    if (!html) return result;

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].replace(/\s+/g, " ").trim();

    // Meta description
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
      || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    if (metaMatch) result.metaDesc = metaMatch[1].replace(/\s+/g, " ").trim();

    // Headings
    const headingRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
      const h = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (h.length > 2 && h.length < 200) result.headings.push(h);
    }

    // Internal links — extract text AND meaningful URL path segments
    const linkRegex = /<a[^>]*href=["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (href.includes(domain) || href.startsWith("/")) {
        if (text.length > 2 && text.length < 100) result.links.push(text);
        const pathParts = href.replace(/^https?:\/\/[^/]+/, "").split("/").filter(Boolean);
        for (const part of pathParts) {
          const clean = part.replace(/[-_]/g, " ").replace(/\.(html|php|aspx?)$/i, "").trim();
          if (clean.length > 2) result.links.push(clean);
        }
      }
    }

    // Extract location from title/meta ("Cherry Hill, NJ" pattern)
    const stateMap: Record<string, string> = {
      AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",
      CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",
      IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",
      MA:"Massachusetts",MD:"Maryland",ME:"Maine",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",
      MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
      NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",
      OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",
      TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",
      WI:"Wisconsin",WV:"West Virginia",WY:"Wyoming",DC:"District of Columbia",
    };
    const locTexts = [result.title, result.metaDesc, ...result.headings.slice(0, 5)].join(" | ");
    const locMatch = locTexts.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[,|]\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WI|WV|WY|DC)\b/);
    if (locMatch) {
      result.location = { city: locMatch[1], stateAbbr: locMatch[2], state: stateMap[locMatch[2]] || locMatch[2] };
    }

    // Extract business name from title (segment matching domain)
    const domainBase = domain.replace(/\.(com|net|org|io|co|us|law|legal|biz|info|ai|app)$/i, "").replace(/^www\./, "").toLowerCase();
    const titleParts = result.title.split(/[|–—\-:•]/).map(p => p.trim()).filter(Boolean);
    for (const part of titleParts) {
      const partClean = part.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (partClean.includes(domainBase) || domainBase.includes(partClean) ||
          part.toLowerCase().split(/\s+/).filter(w => domainBase.includes(w) && w.length > 2).length >=
          Math.ceil(part.split(/\s+/).filter(w => w.length > 1).length * 0.4)) {
        result.businessName = part;
        break;
      }
    }
    if (!result.businessName && titleParts.length > 0) {
      // Fallback: last segment is often the brand
      result.businessName = titleParts[titleParts.length - 1];
    }

    // Extract services from headings, links, URL paths, meta
    // Services are meaningful phrases that describe what the business does
    const serviceTexts = [...result.headings, ...result.links, result.metaDesc].map(t => t.toLowerCase());
    const serviceSet = new Set<string>();
    for (const text of serviceTexts) {
      // Clean up and add if it looks like a service
      const clean = text.replace(/[^a-z0-9\s-]/g, "").trim();
      if (clean.length > 3 && clean.length < 60 && !clean.match(/^(home|about|contact|blog|news|faq|privacy|terms|menu|login|sign)/)) {
        serviceSet.add(clean);
      }
    }
    result.services = [...serviceSet];

    console.log(`[Crawl] ${domain}: title="${result.title.substring(0, 60)}" | location=${result.location ? `${result.location.city}, ${result.location.stateAbbr}` : "none"} | brand="${result.businessName}" | ${result.services.length} services | ${result.headings.length} headings`);
  } catch (err) {
    console.error(`[Crawl] Failed:`, err);
  }
  return result;
}

// ── Generate seed keywords from site analysis ──
function generateSeeds(
  siteData: ReturnType<typeof crawlWebsite> extends Promise<infer T> ? T : never,
  currentKeywords: { keyword: string; position: number | null; volume: number }[]
): string[] {
  const seeds: string[] = [];
  const city = siteData.location?.city || "";
  const stateAbbr = siteData.location?.stateAbbr || "";
  const state = siteData.location?.state || "";

  // Extract core service terms from headings, links, and top-ranking keywords
  const serviceTerms = new Set<string>();
  const brandLower = siteData.businessName.toLowerCase();
  const domainWords = new Set(
    siteData.businessName.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2)
  );
  // Also add domain-derived brand words
  const domBase = (currentKeywords[0]?.keyword || "").split(/\s+/);

  // Common nav/footer garbage to skip
  const navGarbage = /^(about|home|contact|blog|news|faq|privacy|terms|menu|login|sign|team|careers|portfolio|gallery|press|media|resources|events|search|subscribe|follow|share|testimonials|clients|partners|investors|sitemap|copyright|disclaimer|legal notice|track record|our mission|our vision|our story|our team|why choose|how it works|get in touch|join us|see all)\b/i;
  const tooGeneric = /^(page \d|section \d|read more|learn more|view all|see more|click here|get started|submit|download|next|previous|back|close|open|expand|cash flow|track record|hard money|let your|you work|why (?:us|we)|what we|who we|how to get|how it works|what is(?:\s|$)|the opinion|you work hard|let your money|hedge against|our (?:mission|vision|story|investors|approach|process|properties|portfolio))\b/i;
  // Ultra-generic phrases that are never good seeds on their own
  const genericPhrases = new Set(["cash flow","track record","hard money","our team","learn more","read more","get started","contact us","about us","see more","view all","tax benefits","real estate","hard work","our approach","our process","full cycle","sign up","log in","tax advantaged","hedge against inflation","how to get started","what is syndication","the opinion of our investors"]);

  // From headings (strongest signal for service descriptions)
  for (const h of siteData.headings) {
    const clean = h.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
    if (clean.length < 8 || clean.length > 60) continue; // Too short = likely nav, too long = likely paragraph
    if (navGarbage.test(clean) || tooGeneric.test(clean)) continue;
    if (genericPhrases.has(clean)) continue;
    // Skip if contains brand name
    if (domainWords.size > 0 && [...domainWords].some(w => clean.includes(w) && w.length > 3)) continue;
    // Require 3+ words for non-location seeds (2-word phrases are usually too generic)
    if (!city && clean.split(/\s+/).length < 3) continue;
    if (city && clean.split(/\s+/).length >= 2) serviceTerms.add(clean);
    else if (!city && clean.split(/\s+/).length >= 3) serviceTerms.add(clean);
  }

  // From URL paths and link text (weaker signal, more noise)
  for (const link of siteData.links) {
    const clean = link.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
    if (clean.length < 10 || clean.length > 50) continue;
    if (navGarbage.test(clean) || tooGeneric.test(clean)) continue;
    if (genericPhrases.has(clean)) continue;
    if (domainWords.size > 0 && [...domainWords].some(w => clean.includes(w) && w.length > 3)) continue;
    if (clean.split(/\s+/).length >= 3) serviceTerms.add(clean);
  }

  // From top-ranking keywords (top 20 by traffic) — these ARE what the business is about
  const topKeywords = currentKeywords
    .filter(k => k.position !== null && k.position <= 20 && k.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);

  for (const kw of topKeywords) {
    const kwLower = kw.keyword.toLowerCase();
    // Skip branded keywords as seeds
    if (domainWords.size > 0 && [...domainWords].some(w => kwLower.includes(w) && w.length > 3)) continue;
    
    if (city) {
      // For local businesses, only use location-specific existing keywords as seeds
      if (kwLower.includes(city.toLowerCase()) || (stateAbbr && kwLower.includes(stateAbbr.toLowerCase())) || (state && kwLower.includes(state.toLowerCase()))) {
        seeds.push(kw.keyword);
      }
    } else {
      // For non-local businesses, use all non-branded top keywords
      if (kw.keyword.split(/\s+/).length >= 2) seeds.push(kw.keyword);
    }
  }

  // From service terms — combine with location for local seeds
  for (const term of serviceTerms) {
    // Skip terms that contain brand words
    if (domainWords.size > 0 && [...domainWords].some(w => term.includes(w) && w.length > 3)) continue;
    if (term.split(/\s+/).length < 2) continue; // Skip single words

    if (city) {
      // For local businesses: location-specific seeds
      seeds.push(`${term} ${city.toLowerCase()}`);
      if (stateAbbr) seeds.push(`${term} ${city.toLowerCase()} ${stateAbbr.toLowerCase()}`);
      // Also add state-level seeds (broader reach, still relevant)
      if (state) seeds.push(`${term} ${state.toLowerCase()}`);
      if (stateAbbr) seeds.push(`${term} ${stateAbbr.toLowerCase()}`);
    } else {
      // No location detected: use broad seeds
      seeds.push(term);
    }
  }

  // Deduplicate and limit
  const unique = [...new Set(seeds)].slice(0, 30);
  console.log(`[Seeds] Generated ${unique.length} seeds. Sample: ${unique.slice(0, 8).join(" | ")}`);
  return unique;
}

// ── Check if keyword is branded (competitor or self) ──
function isBrandedKeyword(keyword: string, brandName: string, domain: string, competitorDomains: string[]): boolean {
  const kwLower = keyword.toLowerCase();

  // Self-branded: contains the business name word (>3 chars)
  const domainBase = domain.replace(/\.(com|net|org|io|co|us|law|legal|biz|info|ai|app)$/i, "").toLowerCase();
  const brandWords = new Set<string>();
  brandWords.add(domainBase);
  for (const w of domainBase.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z]+/).filter(w => w.length > 3)) {
    brandWords.add(w);
  }
  // Brand name words from title match
  const titleBrandLower = brandName.toLowerCase();
  if (titleBrandLower) {
    const titleClean = titleBrandLower.replace(/[^a-z0-9]/g, "");
    if (titleClean.length > 3) brandWords.add(titleClean);
    for (const w of titleBrandLower.split(/[^a-z0-9]+/).filter(w => w.length > 3)) {
      // Skip common non-brand words
      if (!["law","legal","group","firm","the","and","services","solutions","inc","llc"].includes(w)) {
        brandWords.add(w);
      }
    }
  }

  for (const bw of brandWords) {
    if (kwLower.includes(bw)) return true;
  }

  // Competitor branded
  for (const dom of competitorDomains) {
    const comp = dom.replace(/\.(com|net|org|io|co|us|law|legal|biz|info|gov)$/i, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (comp.length > 3 && kwLower.replace(/\s+/g, "").includes(comp)) return true;
  }

  // Pattern-based brand detection: "[word] law group", "[name] & [name]", etc.
  if (/^[a-z]+\s+(law|legal|group|firm|associates|llc|inc|llp|pllc)(\s|$)/i.test(kwLower) ||
      /^(the\s+)?[a-z]+\s+(law|legal)\s+(group|firm|office)/i.test(kwLower) ||
      /^[a-z]+\s+&\s+[a-z]+/i.test(kwLower) ||
      /^[a-z]+\s+[a-z]+\s+(law|legal|group|firm|associates|llc|inc|llp|pllc)$/i.test(kwLower)) {
    return true;
  }

  return false;
}

export async function GET(req: NextRequest) {
  let domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });
  domain = domain.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();

  if (!API_KEY) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

  try {
    // Step 1: Crawl website + get current organic rankings
    const [siteData, organicRows] = await Promise.all([
      crawlWebsite(domain),
      semrushFetch({
        type: "domain_organic",
        domain,
        export_columns: "Ph,Po,Nq,Cp,Ur,Tr,Tc,Co,Kd",
        display_limit: "200",
        display_sort: "tr_desc",
      }),
    ]);

    const currentKeywords = organicRows.map((r) => ({
      keyword: (r["Ph"] || r["Keyword"] || "").toLowerCase(),
      position: parseInt(r["Po"] || r["Position"]) || null,
      volume: parseInt(r["Nq"] || r["Search Volume"]) || 0,
      cpc: parseFloat(r["Cp"] || r["CPC"]) || 0,
      competition: parseFloat(r["Co"] || r["Competition"]) || 0,
      difficulty: parseInt(r["Kd"] || "0") || 0,
      url: r["Ur"] || r["Url"] || "",
      trafficPercent: parseFloat(r["Tr"] || r["Traffic (%)"]) || 0,
    }));

    const currentRankMap = new Map<string, { position: number | null; url: string }>();
    for (const kw of currentKeywords) {
      if (!currentRankMap.has(kw.keyword)) {
        currentRankMap.set(kw.keyword, { position: kw.position, url: kw.url });
      }
    }

    // Step 2: Generate seed keywords from site analysis
    const seeds = generateSeeds(siteData, currentKeywords);

    // Step 3: Expand seeds using SEMrush phrase_fullsearch (broad match)
    // Expand more seeds for better coverage — SEMrush API can handle it
    const seedsToExpand = seeds.slice(0, 25);
    const expansionResults = await Promise.all(
      seedsToExpand.map(seed =>
        semrushFetch({
          type: "phrase_fullsearch",
          phrase: seed,
          export_columns: "Ph,Nq,Cp,Co,Kd",
          display_limit: "30",
          display_sort: "nq_desc",
        }).then(rows => rows.map(r => {
          r["_seed"] = seed;
          return r;
        }))
      )
    );

    // Also get competitor domains for brand filtering
    const competitorRows = await semrushFetch({
      type: "domain_organic_organic",
      domain,
      export_columns: "Dn,Cr,Np,Or,Ot,Oc,Ad",
      display_limit: "5",
    });
    const competitors = competitorRows.slice(0, 3).map((r) => r["Dn"] || r["Domain"]);

    // Build a simple topic vocabulary from the site for relevance checking
    const siteText = [siteData.title, siteData.metaDesc, ...siteData.headings, ...siteData.links].join(" ").toLowerCase();
    const siteTopicWords = new Set(
      siteText.split(/[^a-z]+/).filter(w => w.length > 3)
    );

    // Step 4: Build gap list — keywords we SHOULD rank for but don't (or rank poorly)
    const gapMap = new Map<string, GapKeyword>();

    for (const rows of expansionResults) {
      for (const r of rows) {
        const kw = (r["Ph"] || r["Keyword"] || "").toLowerCase().trim();
        if (!kw || gapMap.has(kw)) continue;

        const volume = parseInt(r["Nq"] || r["Search Volume"]) || 0;
        const cpc = parseFloat(r["Cp"] || r["CPC"]) || 0;
        const difficulty = parseInt(r["Kd"] || "0") || 0;

        if (volume < 10) continue; // Skip very low volume

        // Check if branded
        if (isBrandedKeyword(kw, siteData.businessName, domain, competitors)) {
          continue;
        }

        // Relevance check: at least one meaningful word in the keyword should
        // appear in the site's content. This catches "commercial elevator" for
        // a real estate investment firm (the word "elevator" never appears on their site)
        const kwContentWords = kw.split(/[^a-z]+/).filter(w => w.length > 4);
        if (kwContentWords.length > 0) {
          const matchesAnySiteWord = kwContentWords.some(w => siteTopicWords.has(w));
          if (!matchesAnySiteWord) continue;
        }

        // Location filtering for local businesses
        if (siteData.location) {
          const cityLower = siteData.location.city.toLowerCase();
          const stateLower = siteData.location.stateAbbr.toLowerCase();
          const stateFullLower = siteData.location.state.toLowerCase();
          const cityWords = cityLower.split(/\s+/);

          // Does this keyword mention OUR location?
          const mentionsOurLocation = kw.includes(cityLower) || cityWords.some(w => w.length > 3 && kw.includes(w)) || 
            kw.includes(` ${stateLower} `) || kw.endsWith(` ${stateLower}`) ||
            kw.includes(stateFullLower) || kw.includes("near me");

          // Check for state abbreviations at word boundaries (e.g., " il", " ga", " tx")
          const stateAbbrRegex = /\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|ia|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)\b/g;
          const foundStates = kw.match(stateAbbrRegex) || [];
          const hasOtherStateAbbr = foundStates.some(s => s !== stateLower);

          // Check for full state names that aren't ours
          const stateNames = ["alabama","alaska","arizona","arkansas","california","colorado","connecticut",
            "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa","kansas",
            "kentucky","louisiana","maine","maryland","massachusetts","michigan","minnesota","mississippi",
            "missouri","montana","nebraska","nevada","new hampshire","new jersey","new mexico","new york",
            "north carolina","north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
            "south carolina","south dakota","tennessee","texas","utah","vermont","virginia",
            "washington","west virginia","wisconsin","wyoming"];
          const hasOtherStateName = stateNames.some(s => kw.includes(s) && s !== stateFullLower);

          // If keyword has another state's name/abbreviation, it's for a different market
          if (hasOtherStateAbbr || hasOtherStateName) continue;

          // For keywords without our specific location:
          // Allow if they mention our state (broader targeting is still relevant)
          const mentionsOurState = kw.includes(` ${stateLower} `) || kw.endsWith(` ${stateLower}`) ||
            kw.includes(stateFullLower) || kw.includes("near me");
          if (!mentionsOurLocation && !mentionsOurState && volume > 1500) continue;
        }

        // Check current ranking
        const existing = currentRankMap.get(kw);
        const currentPos = existing?.position ?? null;

        // Skip if already ranking well (top 10)
        if (currentPos !== null && currentPos <= 10) continue;

        // Categorize
        let category: GapKeyword["category"];
        if (currentPos !== null && currentPos >= 11 && currentPos <= 20) category = "quick_wins";
        else if (currentPos !== null && currentPos >= 21 && currentPos <= 50) category = "growth";
        else category = "new_territory";

        const currentTraffic = currentPos ? volume * ctrAtPosition(currentPos) : 0;
        const projectedTraffic = volume * 0.11;
        const uplift = Math.round(projectedTraffic - currentTraffic);

        gapMap.set(kw, {
          keyword: r["Ph"] || r["Keyword"],
          position: currentPos,
          volume,
          cpc,
          competition: parseFloat(r["Co"] || r["Competition"]) || 0,
          difficulty,
          url: existing?.url || "",
          trafficPercent: 0,
          category,
          currentTraffic: Math.round(currentTraffic),
          projectedTraffic: Math.round(projectedTraffic),
          uplift,
          seed: r["_seed"] || "",
        });
      }
    }

    console.log(`[Gaps] ${gapMap.size} keyword opportunities found from ${seedsToExpand.length} seeds`);

    // Sort by value (volume × cpc)
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
        title: siteData.title,
        metaDescription: siteData.metaDesc.substring(0, 200),
        businessName: siteData.businessName,
        location: siteData.location,
        servicesDetected: siteData.services.length,
        seedsGenerated: seedsToExpand.length,
        seedSample: seedsToExpand.slice(0, 5),
      },
      currentKeywords: currentKeywords.slice(0, 20).map(k => ({
        keyword: k.keyword,
        position: k.position,
        volume: k.volume,
        cpc: k.cpc,
        url: k.url,
        trafficPercent: k.trafficPercent,
      })),
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
