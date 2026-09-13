import type { BusinessLead } from '../types';
import type { AuditLinkGroup, GbpProfileSnapshot } from './types';

function enc(value: string): string {
  return encodeURIComponent(value);
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function websiteOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return '';
  }
}

/** Google Search kgmid param — keep /g/… path unencoded like GMB Everywhere. */
function kgmidQueryValue(kgId: string): string {
  const trimmed = kgId.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function kgSearchUrl(kgId: string, hash: string, withUact = false): string {
  const kgmid = kgmidQueryValue(kgId);
  const base = `https://www.google.com/search?kgmid=${kgmid}`;
  const query = withUact ? `${base}&uact=5` : base;
  return hash ? `${query}#${hash}` : query;
}

export function buildAuditLinkGroups(
  snapshot: GbpProfileSnapshot,
  lead: BusinessLead
): AuditLinkGroup[] {
  const name = snapshot.name || lead.name;
  const address = snapshot.address || lead.address;
  const query = `${name} ${address}`.trim();
  const mapsUrl = snapshot.mapsUrl || lead.mapsUrl;
  const placeId = snapshot.placeId || lead.id;
  const cid = snapshot.cid;
  const website = snapshot.website;
  const domain = domainFromUrl(website);

  const reviewPlaceId = placeId.startsWith('ChIJ') ? placeId : '';

  const googleMaps: AuditLinkGroup = {
    title: 'Google Maps Links',
    links: [
      { label: 'Google Maps Profile', url: mapsUrl, description: 'Open business on Google Maps' },
      {
        label: 'Review List',
        url: reviewPlaceId
          ? `https://search.google.com/local/reviews?placeid=${enc(reviewPlaceId)}`
          : mapsUrl.includes('?')
            ? `${mapsUrl}&hl=en`
            : `${mapsUrl}?hl=en`,
        description: 'View all Google reviews',
      },
      {
        label: 'Write a Review',
        url: reviewPlaceId
          ? `https://search.google.com/local/writereview?placeid=${enc(reviewPlaceId)}`
          : `https://search.google.com/local/writereview?placeid=${enc(placeId)}`,
        description: 'Review request link for customers',
      },
      {
        label: 'Google Search — Knowledge Panel',
        url: `https://www.google.com/search?q=${enc(name + ' ' + address)}`,
        description: 'See Knowledge Panel in Google Search',
      },
      {
        label: 'Search — Same Address GMBs',
        url: `https://www.google.com/maps/search/${enc(address)}`,
        description: 'Find other businesses at this address',
      },
    ],
  };

  if (domain) {
    googleMaps.links.push({
      label: 'Search — Same Website Domain',
      url: `https://www.google.com/search?q=site:${enc(domain)}`,
      description: 'Find GMBs sharing this website domain',
    });
  }

  if (cid) {
    googleMaps.links.push({
      label: 'Maps Link (CID)',
      url: `https://www.google.com/maps?cid=${cid}`,
      description: 'Direct link using CID',
    });
  }

  if (placeId && placeId.startsWith('ChIJ')) {
    googleMaps.links.push({
      label: 'Maps Link (Place ID)',
      url: `https://www.google.com/maps/place/?q=place_id:${enc(placeId)}`,
      description: 'Direct link using Place ID',
    });
  }

  if (snapshot.knowledgeGraphId) {
    const kgId = snapshot.knowledgeGraphId;
    googleMaps.links.push(
      {
        label: 'Google Search (KG ID)',
        url: kgSearchUrl(kgId, ''),
        description: 'Open Knowledge Graph entity in Google Search',
      },
      {
        label: 'GMB Post URL',
        url: kgSearchUrl(kgId, 'lpstate=pid:-1', true),
        description: 'Open Google posts / updates for this business',
      },
      {
        label: 'Questions and Answers URL',
        url: kgSearchUrl(kgId, 'lpqa=d,2', true),
        description: 'Open the Q&A section for this business',
      },
      {
        label: 'Products',
        url: kgSearchUrl(kgId, 'lpc=lpc'),
        description: 'Open the products listing for this business',
      }
    );
  }

  const directories: AuditLinkGroup = {
    title: 'External Maps & Directories',
    links: [
      {
        label: 'Apple Maps',
        url: `https://maps.apple.com/?q=${enc(query)}`,
        description: 'Search on Apple Maps',
      },
      {
        label: 'Apple Maps — Directions',
        url: `https://maps.apple.com/?daddr=${enc(address)}`,
        description: 'Driving directions on Apple Maps',
      },
      {
        label: 'Bing Maps',
        url: `https://www.bing.com/maps?q=${enc(query)}`,
        description: 'Search on Bing Maps',
      },
      {
        label: 'Bing Maps — Directions',
        url: `https://www.bing.com/maps?rtp=~pos.${enc(address)}`,
        description: 'Driving directions on Bing Maps',
      },
      {
        label: 'Facebook Places Search',
        url: `https://www.facebook.com/search/places/?q=${enc(name)}`,
        description: 'Find on Facebook Places',
      },
      {
        label: 'Yelp Business Search',
        url: `https://www.yelp.com/search?find_desc=${enc(name)}&find_loc=${enc(address)}`,
        description: 'Find on Yelp',
      },
    ],
  };

  const seoTools: AuditLinkGroup = {
    title: website ? 'SEO & Technical Tools' : 'SEO & Marketing Tools',
    links: [],
  };

  if (website && domain) {
    const origin = websiteOrigin(website);
    seoTools.links.push(
      {
        label: 'Robots.txt File',
        url: `${origin}/robots.txt`,
        description: 'View robots.txt crawl rules',
      },
      {
        label: 'Sitemap.xml File',
        url: `${origin}/sitemap.xml`,
        description: 'View XML sitemap',
      },
      {
        label: 'Open Graph Preview',
        url: `https://metatags.io/?url=${enc(website)}`,
        description: 'Preview social sharing meta tags',
      },
      {
        label: 'Domain Name Lookup',
        url: `https://whois.domaintools.com/${enc(domain)}`,
        description: 'WHOIS domain registration lookup',
      },
      {
        label: 'Technology Used on Website',
        url: `https://builtwith.com/${enc(domain)}`,
        description: 'Tech stack lookup',
      },
      {
        label: 'Website History',
        url: `https://web.archive.org/web/*/${enc(website)}`,
        description: 'Historical snapshots on Wayback Machine',
      },
      {
        label: 'External Domain Mentions',
        url: `https://www.google.com/search?q=${enc(`-site:${domain} "${domain}"`)}`,
        description: 'Find mentions of this domain on other sites',
      },
      {
        label: 'Backlinko SEO Checker',
        url: `https://tools.backlinko.com/seo-checker?q=${enc(domain)}`,
        description: 'On-page SEO analysis',
      },
      {
        label: 'Google PageSpeed Insights',
        url: `https://pagespeed.web.dev/analysis?url=${enc(website)}`,
        description: 'Website speed analysis',
      },
      {
        label: 'Google Rich Results Test',
        url: `https://search.google.com/test/rich-results?url=${enc(website)}`,
        description: 'Structured data validation',
      },
      {
        label: 'Google Index — Site',
        url: `https://www.google.com/search?q=site:${enc(domain)}`,
        description: 'Pages indexed by Google',
      }
    );
  } else if (website) {
    const origin = websiteOrigin(website);
    seoTools.links.push(
      {
        label: 'Robots.txt File',
        url: origin ? `${origin}/robots.txt` : `${website.replace(/\/$/, '')}/robots.txt`,
        description: 'View robots.txt crawl rules',
      },
      {
        label: 'Open Graph Preview',
        url: `https://metatags.io/?url=${enc(website)}`,
        description: 'Preview social sharing meta tags',
      },
      {
        label: 'Google PageSpeed Insights',
        url: `https://pagespeed.web.dev/analysis?url=${enc(website)}`,
        description: 'Website speed analysis',
      },
      {
        label: 'Google Rich Results Test',
        url: `https://search.google.com/test/rich-results?url=${enc(website)}`,
        description: 'Structured data validation',
      },
      {
        label: 'Website History',
        url: `https://web.archive.org/web/*/${enc(website)}`,
        description: 'Historical snapshots on Wayback Machine',
      }
    );
  } else {
    seoTools.links.push(
      {
        label: 'Google Ads Transparency',
        url: `https://adstransparency.google.com/?region=US&q=${enc(name)}`,
        description: 'Check if business runs Google Ads',
      },
      {
        label: 'Google Trends — Category',
        url: `https://trends.google.com/trends/explore?q=${enc(snapshot.primaryCategory || lead.category)}`,
        description: 'Category search trends',
      },
      {
        label: 'Facebook Ad Library',
        url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&q=${enc(name)}`,
        description: 'Check Facebook/Instagram ads',
      }
    );
  }

  return [googleMaps, directories, seoTools];
}

export function snapshotToRows(snapshot: GbpProfileSnapshot, lead: BusinessLead): { label: string; value: string }[] {
  const fmt = (v: string | number | null | undefined, fallback = 'N/A') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
  };
  const yesNo = (v: boolean | null | undefined) => {
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    return 'N/A';
  };

  return [
    { label: 'Business Name', value: fmt(snapshot.name || lead.name) },
    { label: 'Address', value: fmt(snapshot.address || lead.address) },
    { label: 'Phone', value: fmt(snapshot.phone || lead.phone) },
    { label: 'Website', value: snapshot.hasWebsite ? fmt(snapshot.website) : 'None listed' },
    { label: 'Business Status', value: fmt(snapshot.businessStatus) },
    { label: 'Plus Code', value: fmt(snapshot.plusCode) },
    {
      label: 'Latitude / Longitude',
      value:
        snapshot.lat != null && snapshot.lng != null
          ? `${snapshot.lat}, ${snapshot.lng}`
          : 'N/A',
    },
    { label: 'Place ID', value: fmt(snapshot.placeId || lead.id) },
    { label: 'CID', value: fmt(snapshot.cid) },
    { label: 'Knowledge Panel ID', value: fmt(snapshot.knowledgeGraphId) },
    { label: 'Business Profile ID', value: fmt(snapshot.businessProfileId) },
    { label: 'Google Maps Rank', value: lead.mapsRank ? `#${lead.mapsRank}` : 'N/A' },
    { label: 'Review Rating', value: fmt(snapshot.rating ?? lead.rating) },
    { label: 'Review Count', value: fmt(snapshot.reviewCount ?? lead.reviews) },
    { label: 'Negative Reviews', value: fmt(snapshot.negativeReviewCount) },
    { label: 'Primary Category', value: fmt(snapshot.primaryCategory || lead.category) },
    {
      label: 'Secondary Categories',
      value: snapshot.secondaryCategories.length ? snapshot.secondaryCategories.join(', ') : 'N/A',
    },
    { label: 'Business Hours', value: fmt(snapshot.hours) },
    { label: 'Special Hours', value: fmt(snapshot.specialHours) },
    { label: 'Booking Link', value: fmt(snapshot.bookingLink) },
    { label: 'Services', value: snapshot.services.length ? snapshot.services.join(', ') : 'N/A' },
    { label: 'Attributes', value: snapshot.attributes.length ? snapshot.attributes.join(', ') : 'N/A' },
    { label: 'Service Areas', value: snapshot.serviceAreas.length ? snapshot.serviceAreas.join(', ') : 'N/A' },
    { label: 'Photos', value: yesNo(snapshot.hasPhotos) },
    { label: 'Latest Photo', value: snapshot.latestPhotoDate ? snapshot.latestPhotoDate : 'N/A' },
    { label: 'Google Posts', value: yesNo(snapshot.hasPosts) },
    { label: 'Latest Post Date', value: snapshot.latestPostDate ? snapshot.latestPostDate : 'N/A' },
  ];
}
