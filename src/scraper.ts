import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

const TABELOG_SEARCH_URL = "https://tabelog.com/rstLst/";
const TABELOG_BASE_URL = "https://tabelog.com";

/** Map from radius in meters to Tabelog's "range" parameter value. */
const RANGE_MAP: Array<[number, number]> = [
  [300, 1],
  [500, 2],
  [1000, 3],
  [3000, 4],
  [5000, 5],
];

export interface Restaurant {
  name: string;
  url: string;
  score: number | null;
  genre: string;
  address: string;
  image: string;
  budget: string;
  lat: number | null;
  lng: number | null;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function boundingBox(lat: number, lng: number, radiusMeters: number): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  const metersPerDegLat = 111320;
  const latRad = toRadians(lat);
  const metersPerDegLon = Math.max(1, Math.cos(latRad) * metersPerDegLat);
  const dLat = radiusMeters / metersPerDegLat;
  const dLon = radiusMeters / metersPerDegLon;
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLon: lng - dLon,
    maxLon: lng + dLon,
  };
}

function tabelogRange(radiusMeters: number): number {
  for (const [threshold, rangeVal] of RANGE_MAP) {
    if (radiusMeters <= threshold) return rangeVal;
  }
  return 5;
}

function parseScore(text: string): number | null {
  const cleaned = text.trim();
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? null : val;
}

function parseCard($: cheerio.CheerioAPI, card: AnyNode): Restaurant | null {
  const $card = $(card);

  // Name & URL
  const nameTag =
    $card.find(".list-rst__rst-name-target").first() ||
    $card.find(".list-rst__rst-name a").first();
  const name = nameTag.text().trim();
  if (!name) return null;
  const href = nameTag.attr("href") ?? "";
  const url = href.startsWith("http") ? href : TABELOG_BASE_URL + href;

  // Score
  const scoreText =
    $card.find(".c-rating__val").first().text() ||
    $card.find(".list-rst__rating-val").first().text();
  const score = parseScore(scoreText);

  // Genre
  const genre =
    $card.find(".list-rst__category-item").first().text().trim() ||
    $card.find(".list-rst__cuisine-item").first().text().trim();

  // Address
  const address = $card.find(".list-rst__address").first().text().trim();

  // Thumbnail
  const imgTag = $card.find(".c-thumb img, .list-rst__image-wrap img").first();
  let image = imgTag.attr("data-src") ?? imgTag.attr("src") ?? "";
  if (image.startsWith("//")) image = "https:" + image;

  // Budget
  const budget = $card.find(".list-rst__budget-item").first().text().trim();

  // Coordinates (embedded as data attributes on the card element)
  const lat = parseFloat($card.attr("data-lat") ?? "");
  const lng = parseFloat($card.attr("data-lng") ?? "");

  return { name, url, score, genre, address, image, budget,
    lat: isNaN(lat) ? null : lat,
    lng: isNaN(lng) ? null : lng,
  };
}

function parseCoordsFromText(text: string): { lat: number; lng: number } | null {
  const normalized = text.trim();
  if (!normalized) return null;

  try {
    const parsed = JSON.parse(normalized);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const geo = (entry as { geo?: { latitude?: unknown; longitude?: unknown } }).geo;
      const lat = typeof geo?.latitude === "number" ? geo.latitude : parseFloat(String(geo?.latitude ?? ""));
      const lng = typeof geo?.longitude === "number" ? geo.longitude : parseFloat(String(geo?.longitude ?? ""));
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng };
      }
    }
  } catch {
    // Ignore invalid JSON chunks.
  }

  const latLngPair = normalized.match(/lat=([+-]?\d+(?:\.\d+)?)[^0-9+-]+lng=([+-]?\d+(?:\.\d+)?)/i);
  if (latLngPair) {
    const lat = parseFloat(latLngPair[1]);
    const lng = parseFloat(latLngPair[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  const centerPair = normalized.match(/center=([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/i);
  if (centerPair) {
    const lat = parseFloat(centerPair[1]);
    const lng = parseFloat(centerPair[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  return null;
}

async function fetchCoordinatesFromDetailPage(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://tabelog.com/",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
    for (const script of jsonLdScripts) {
      const coords = parseCoordsFromText($(script).text());
      if (coords) return coords;
    }

    const printBtn = $("[data-print-url]").first().attr("data-print-url");
    if (printBtn) {
      const coords = parseCoordsFromText(printBtn);
      if (coords) return coords;
    }
  } catch {
    return null;
  }

  return null;
}

async function backfillMissingCoordinates(restaurants: Restaurant[], maxLookups = 12): Promise<void> {
  let lookups = 0;
  for (const restaurant of restaurants) {
    if (restaurant.lat !== null && restaurant.lng !== null) continue;
    if (lookups >= maxLookups) break;
    lookups += 1;

    const coords = await fetchCoordinatesFromDetailPage(restaurant.url);
    if (!coords) continue;
    restaurant.lat = coords.lat;
    restaurant.lng = coords.lng;
  }
}

export async function fetchRestaurants(
  lat: number,
  lng: number,
  radiusMeters: number,
  minScore: number,
  maxPages = 3
): Promise<Restaurant[]> {
  const range = tabelogRange(radiusMeters);
  const box = boundingBox(lat, lng, radiusMeters);
  const results: Restaurant[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      utf8: "✓",
      maxLat: String(box.maxLat),
      minLat: String(box.minLat),
      maxLon: String(box.maxLon),
      minLon: String(box.minLon),
      LstPrf: "",
      LstAre: "",
      lat: String(lat),
      lon: String(lng),
      lng: String(lng),
      zoom: String(Math.max(11, Math.min(16, 16 - range))),
      RdoCosTp: "2",
      LstCos: "0",
      LstCosT: "0",
      ChkParking: "0",
      LstSmoking: "0",
      SrtT: "trend",
      Srt: "D",
      range: String(range),
      PG: String(page),
    });

    const url = `${TABELOG_SEARCH_URL}?${params}`;

    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: "https://tabelog.com/",
        },
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    const $ = cheerio.load(html);
    const cards = $("li.list-rst, .list-rst__wrap, article.list-rst").toArray();

    if (cards.length === 0) break;

    for (const card of cards) {
      const r = parseCard($, card);
      if (!r || r.score === null || r.score < minScore) {
        continue;
      }

      // When coordinates are available, enforce radius strictly.
      // Some result pages omit per-card coordinates; keep those entries.
      if (r.lat === null || r.lng === null) {
        results.push(r);
        continue;
      }

      const d = distanceMeters(lat, lng, r.lat, r.lng);
      if (d <= radiusMeters) {
        results.push(r);
      }
    }

    // Stop if last page (partial result)
    if (cards.length < 20) break;

    // Polite delay between pages
    await new Promise((r) => setTimeout(r, 500));
  }

  await backfillMissingCoordinates(results);

  const filtered = results.filter((restaurant) => {
    if (restaurant.lat === null || restaurant.lng === null) {
      return true;
    }
    return distanceMeters(lat, lng, restaurant.lat, restaurant.lng) <= radiusMeters;
  });

  return filtered.sort((a, b) => {
    const scoreA = a.score ?? -Infinity;
    const scoreB = b.score ?? -Infinity;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.name.localeCompare(b.name, "ja");
  });
}
