/**
 * SERP Enhancer - Add Website Age to Google Search Results
 * 
 * Detects search results, fetches domain age, and displays badges
 */

import { safeRuntimeSendMessage } from './extension-context';

interface SearchResult {
  element: HTMLElement;
  url: string;
  domain: string;
  titleElement?: HTMLElement;
  citeElement?: HTMLElement;
}

/**
 * Extract all organic search results from the page
 * Using EXACT selectors from actual Google SERP HTML structure
 */
export function getSearchResults(): SearchResult[] {
  const results: SearchResult[] = [];
  
  // Use div.MjjYud - this is the exact wrapper for each result
  const resultElements = document.querySelectorAll('div.MjjYud');
  
  console.log(`[SERP Enhancer] Found ${resultElements.length} results using div.MjjYud`);
  
  resultElements.forEach((el) => {
    // Find the main link: .yuRUbf a[href]
    const linkElement = el.querySelector('.yuRUbf a[href]') as HTMLAnchorElement;
    if (!linkElement) return;
    
    const url = linkElement.href;
    
    // Skip Google's own URLs, internal search links, and non-http(s)
    if (!url.startsWith('http') || 
        url.includes('google.com/search') || 
        url.includes('google.com/url')) return;
    
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      
      // Find title element (h3.LC20lb)
      const titleElement = el.querySelector('h3.LC20lb') as HTMLElement;
      
      // Find cite element (for injection point near URL)
      const citeElement = el.querySelector('cite') as HTMLElement;
      
      results.push({
        element: el as HTMLElement,
        url,
        domain,
        titleElement,
        citeElement,
      });
    } catch (error) {
      console.warn('[SERP Enhancer] Invalid URL:', url, error);
    }
  });
  
  return results;
}

/**
 * Fetch domain age from service worker
 */
async function fetchDomainAge(domain: string): Promise<number | null> {
  try {
    const response = await safeRuntimeSendMessage<{ domainAge: number | null }>({
      type: 'FETCH_DOMAIN_AGE',
      domain,
    });
    
    return response?.domainAge ?? null;
  } catch (error) {
    console.error('[SERP Enhancer] Failed to fetch domain age:', error);
    return null;
  }
}

/**
 * Create and inject domain age badge
 */
function createDomainAgeBadge(domainAge: number): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'nwf-domain-age-badge';
  
  // Style the badge
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin-left: 8px;
    background: #f1f3f4;
    color: #5f6368;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
  `;
  
  // Color-code based on age
  if (domainAge >= 10) {
    // Old domain (10+ years) - green (trustworthy)
    badge.style.background = '#e6f4ea';
    badge.style.color = '#137333';
  } else if (domainAge >= 5) {
    // Medium age (5-10 years) - blue
    badge.style.background = '#e8f0fe';
    badge.style.color = '#1967d2';
  } else if (domainAge >= 2) {
    // Young domain (2-5 years) - gray
    badge.style.background = '#f1f3f4';
    badge.style.color = '#5f6368';
  } else {
    // Very new domain (<2 years) - yellow (caution)
    badge.style.background = '#fef7e0';
    badge.style.color = '#f29900';
  }
  
  badge.innerHTML = `
    <span>🕒</span>
    <span>${domainAge.toFixed(1)}y</span>
  `;
  
  badge.title = `Domain registered ${domainAge.toFixed(1)} years ago`;
  
  return badge;
}

/**
 * Enhance a single search result with domain age
 * Injects badge after the cite element (URL display)
 */
export async function enhanceSearchResult(result: SearchResult): Promise<void> {
  // Check if already enhanced
  if (result.element.querySelector('.nwf-domain-age-badge')) return;
  
  // Find best injection point: cite element's parent, or title area
  const injectionPoint = result.citeElement?.parentElement || result.titleElement?.parentElement;
  if (!injectionPoint) {
    console.warn('[SERP Enhancer] No injection point found for:', result.domain);
    return;
  }
  
  // Create loading indicator
  const loadingBadge = document.createElement('span');
  loadingBadge.className = 'nwf-domain-age-loading';
  loadingBadge.style.cssText = `
    display: inline-flex;
    align-items: center;
    margin-left: 8px;
    font-size: 12px;
    color: #9aa0a6;
  `;
  loadingBadge.innerHTML = '⏳';
  loadingBadge.title = 'Loading domain age...';
  
  // Insert loading badge after cite or title
  if (result.citeElement) {
    result.citeElement.parentElement?.appendChild(loadingBadge);
  } else {
    injectionPoint.appendChild(loadingBadge);
  }
  
  try {
    // Fetch domain age
    const domainAge = await fetchDomainAge(result.domain);
    
    // Remove loading badge
    loadingBadge.remove();
    
    // If we got data, show it
    if (domainAge !== null && domainAge >= 0) {
      const badge = createDomainAgeBadge(domainAge);
      if (result.citeElement) {
        result.citeElement.parentElement?.appendChild(badge);
      } else {
        injectionPoint.appendChild(badge);
      }
    }
  } catch (error) {
    console.error('[SERP Enhancer] Error enhancing result:', error);
    loadingBadge.remove();
  }
}

/**
 * Enhance all search results on the page
 */
async function enhanceAllResults(): Promise<void> {
  const results = getSearchResults();
  
  console.log(`[SERP Enhancer] Found ${results.length} search results`);
  
  if (results.length === 0) {
    console.warn('[SERP Enhancer] No results found! Page structure may have changed.');
    return;
  }
  
  // Process top 10 results (first page)
  const topResults = results.slice(0, 10);
  
  // Process sequentially with small delays to avoid rate limiting
  for (const result of topResults) {
    await enhanceSearchResult(result);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Initialize SERP enhancer
 */
export function init(): void {
  // Check if we're on a Google search results page
  if (!window.location.hostname.includes('google.com')) return;
  if (!window.location.pathname.includes('/search')) return;
  
  console.log('[SERP Enhancer] Initializing on Google search page');
  
  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAllResults);
  } else {
    // Small delay to ensure DOM is fully rendered
    setTimeout(enhanceAllResults, 500);
  }
  
  // Watch for new results (infinite scroll, new searches)
  // Using debouncing to avoid performance issues
  let debounceTimer: number;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(enhanceAllResults, 1000) as unknown as number;
  });
  
  const searchContainer = document.querySelector('#search');
  if (searchContainer) {
    observer.observe(searchContainer, {
      childList: true,
      subtree: true,
    });
  }
}

// Start the enhancer
// TEMPORARILY DISABLED - Debugging window error
// init();
