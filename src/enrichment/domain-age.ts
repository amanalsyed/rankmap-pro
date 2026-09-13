/**
 * Domain Age Fetcher
 * 
 * Fetches domain registration age using free WHOIS APIs
 */

// Cache domain ages in memory (persist across requests in same session)
const domainAgeCache = new Map<string, { age: number | null; timestamp: number }>();
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return null;
  }
}

/**
 * Get domain age from Chrome storage cache
 */
async function getCachedDomainAge(domain: string): Promise<number | null> {
  // Check memory cache first
  const memCache = domainAgeCache.get(domain);
  if (memCache && Date.now() - memCache.timestamp < CACHE_DURATION) {
    return memCache.age;
  }
  
  // Check Chrome storage cache
  try {
    const key = `domain_age_${domain}`;
    const result = await chrome.storage.local.get(key);
    
    if (result[key]) {
      const cached = result[key];
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        // Update memory cache
        domainAgeCache.set(domain, cached);
        return cached.age;
      }
    }
  } catch (error) {
    console.error('[Domain Age] Cache read error:', error);
  }
  
  return null;
}

/**
 * Save domain age to cache
 */
async function cacheDomainAge(domain: string, age: number | null): Promise<void> {
  const cached = { age, timestamp: Date.now() };
  
  // Save to memory cache
  domainAgeCache.set(domain, cached);
  
  // Save to Chrome storage
  try {
    const key = `domain_age_${domain}`;
    await chrome.storage.local.set({ [key]: cached });
  } catch (error) {
    console.error('[Domain Age] Cache write error:', error);
  }
}

/**
 * Fetch domain age from WHOIS API
 * 
 * Uses a simple estimation based on archive.org (Wayback Machine)
 * This is free and doesn't require API keys
 */
async function fetchDomainAgeFromAPI(domain: string): Promise<number | null> {
  try {
    console.log(`[Domain Age] Fetching age for: ${domain}`);
    
    // Use Wayback Machine API to find earliest snapshot
    // This is completely free and reliable
    const response = await fetch(
      `https://archive.org/wayback/available?url=${domain}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    
    if (!response.ok) {
      console.warn(`[Domain Age] Wayback API failed for ${domain}`);
      return null;
    }
    
    const data = await response.json();
    
    // Get the earliest snapshot date
    const earliestSnapshot = data.archived_snapshots?.closest?.timestamp;
    
    if (!earliestSnapshot) {
      console.warn(`[Domain Age] No archive data for ${domain}`);
      return null;
    }
    
    // Parse timestamp (format: YYYYMMDDhhmmss)
    const year = parseInt(earliestSnapshot.substring(0, 4));
    const month = parseInt(earliestSnapshot.substring(4, 6)) - 1;
    const day = parseInt(earliestSnapshot.substring(6, 8));
    
    const firstSeen = new Date(year, month, day);
    const now = new Date();
    const ageYears = (now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    const age = Math.max(0, Math.round(ageYears * 10) / 10);
    console.log(`[Domain Age] ${domain} is ~${age} years old`);
    
    return age;
  } catch (error) {
    console.error(`[Domain Age] API fetch failed for ${domain}:`, error);
    return null;
  }
}


/**
 * Get domain age (with caching)
 * 
 * Returns age in years (e.g., 5.2) or null if lookup failed
 */
export async function getDomainAge(urlOrDomain: string): Promise<number | null> {
  const domain = extractDomain(urlOrDomain);
  if (!domain) return null;
  
  // Check cache first
  const cached = await getCachedDomainAge(domain);
  if (cached !== null) {
    return cached;
  }
  
  // Fetch from API
  const age = await fetchDomainAgeFromAPI(domain);
  
  // Cache the result (even if null, to avoid repeated failed lookups)
  await cacheDomainAge(domain, age);
  
  return age;
}

/**
 * Batch fetch domain ages for multiple domains
 * (useful for fetching multiple results at once)
 */
export async function batchGetDomainAges(domains: string[]): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();
  
  // Fetch all in parallel (but APIs might rate limit)
  const promises = domains.map(async (domain) => {
    const age = await getDomainAge(domain);
    results.set(domain, age);
  });
  
  await Promise.all(promises);
  
  return results;
}
