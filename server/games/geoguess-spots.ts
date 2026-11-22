import type { GeoPoint } from '../../shared/games/geoguess';

export interface GeoSpot {
  id: string;
  label: string;
  imageUrl: string;
  coords: GeoPoint;
}

export type SpotFetcher = (usedIds: string[]) => Promise<GeoSpot>;

interface SeedRegion {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

const SEED_REGIONS: ReadonlyArray<SeedRegion> = [
  { id: 'tokyo', label: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
  { id: 'kyoto', label: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
  { id: 'paris', label: 'Paris, France', lat: 48.8566, lng: 2.3522 },
  { id: 'lyon', label: 'Lyon, France', lat: 45.764, lng: 4.8357 },
  { id: 'marseille', label: 'Marseille, France', lat: 43.2965, lng: 5.3698 },
  { id: 'london', label: 'London, UK', lat: 51.5072, lng: -0.1276 },
  { id: 'nyc', label: 'New York, USA', lat: 40.7128, lng: -74.006 },
  { id: 'sf', label: 'San Francisco, USA', lat: 37.7749, lng: -122.4194 },
  { id: 'rio', label: 'Rio de Janeiro, Brazil', lat: -22.9068, lng: -43.1729 },
  { id: 'buenos-aires', label: 'Buenos Aires, Argentina', lat: -34.6037, lng: -58.3816 },
  { id: 'cairo', label: 'Cairo, Egypt', lat: 30.0444, lng: 31.2357 },
  { id: 'cape-town', label: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241 },
  { id: 'sydney', label: 'Sydney, Australia', lat: -33.8688, lng: 151.2093 },
  { id: 'reykjavik', label: 'Reykjavik, Iceland', lat: 64.1466, lng: -21.9426 },
  { id: 'oslo', label: 'Oslo, Norway', lat: 59.9139, lng: 10.7522 },
  { id: 'rome', label: 'Rome, Italy', lat: 41.9028, lng: 12.4964 },
  { id: 'milan', label: 'Milan, Italy', lat: 45.4642, lng: 9.19 },
  { id: 'barcelona', label: 'Barcelona, Spain', lat: 41.3874, lng: 2.1686 },
  { id: 'madrid', label: 'Madrid, Spain', lat: 40.4168, lng: -3.7038 },
  { id: 'lisbon', label: 'Lisbon, Portugal', lat: 38.7223, lng: -9.1393 },
  { id: 'prague', label: 'Prague, Czechia', lat: 50.0755, lng: 14.4378 },
  { id: 'istanbul', label: 'Istanbul, Turkey', lat: 41.0082, lng: 28.9784 },
  { id: 'bangkok', label: 'Bangkok, Thailand', lat: 13.7563, lng: 100.5018 },
  { id: 'seoul', label: 'Seoul, South Korea', lat: 37.5665, lng: 126.978 },
  { id: 'singapore', label: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { id: 'mexico-city', label: 'Mexico City, Mexico', lat: 19.4326, lng: -99.1332 },
  { id: 'lima', label: 'Lima, Peru', lat: -12.0464, lng: -77.0428 },
  { id: 'nairobi', label: 'Nairobi, Kenya', lat: -1.2921, lng: 36.8219 },
  { id: 'marrakesh', label: 'Marrakesh, Morocco', lat: 31.6295, lng: -7.9811 },
  { id: 'athens', label: 'Athens, Greece', lat: 37.9838, lng: 23.7275 },
  { id: 'amsterdam', label: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
  { id: 'berlin', label: 'Berlin, Germany', lat: 52.52, lng: 13.405 },
  { id: 'munich', label: 'Munich, Germany', lat: 48.1351, lng: 11.582 },
  { id: 'vienna', label: 'Vienna, Austria', lat: 48.2082, lng: 16.3738 },
  { id: 'zurich', label: 'Zurich, Switzerland', lat: 47.3769, lng: 8.5417 },
  { id: 'brussels', label: 'Brussels, Belgium', lat: 50.8503, lng: 4.3517 },
  { id: 'toronto', label: 'Toronto, Canada', lat: 43.6532, lng: -79.3832 },
  { id: 'montreal', label: 'Montreal, Canada', lat: 45.5017, lng: -73.5673 },
  { id: 'chicago', label: 'Chicago, USA', lat: 41.8781, lng: -87.6298 },
  { id: 'auckland', label: 'Auckland, New Zealand', lat: -36.8485, lng: 174.7633 },
  { id: 'dublin', label: 'Dublin, Ireland', lat: 53.3498, lng: -6.2603 },
  { id: 'edinburgh', label: 'Edinburgh, Scotland', lat: 55.9533, lng: -3.1883 },
  { id: 'stockholm', label: 'Stockholm, Sweden', lat: 59.3293, lng: 18.0686 },
  { id: 'warsaw', label: 'Warsaw, Poland', lat: 52.2297, lng: 21.0122 },
  { id: 'taipei', label: 'Taipei, Taiwan', lat: 25.033, lng: 121.5654 },
  { id: 'hong-kong', label: 'Hong Kong', lat: 22.3193, lng: 114.1694 },
];

const FALLBACK_SPOTS: ReadonlyArray<GeoSpot> = [
  {
    id: 'fallback-paris',
    label: 'Paris, France',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg/1280px-La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg',
    coords: { lat: 48.8584, lng: 2.2945 },
  },
  {
    id: 'fallback-tokyo',
    label: 'Tokyo, Japan',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Skyscrapers_of_Shinjuku_2009_January.jpg/1280px-Skyscrapers_of_Shinjuku_2009_January.jpg',
    coords: { lat: 35.6895, lng: 139.6917 },
  },
  {
    id: 'fallback-nyc',
    label: 'New York, USA',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/New_york_times_square-terabass.jpg/1280px-New_york_times_square-terabass.jpg',
    coords: { lat: 40.758, lng: -73.9855 },
  },
  {
    id: 'fallback-rio',
    label: 'Rio de Janeiro, Brazil',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Cidade_Maravilhosa.jpg/1280px-Cidade_Maravilhosa.jpg',
    coords: { lat: -22.9519, lng: -43.2105 },
  },
  {
    id: 'fallback-sydney',
    label: 'Sydney, Australia',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Sydney_Opera_House_-_Dec_2008.jpg/1280px-Sydney_Opera_House_-_Dec_2008.jpg',
    coords: { lat: -33.8568, lng: 151.2153 },
  },
  {
    id: 'fallback-cairo',
    label: 'Giza, Egypt',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/All_Gizah_Pyramids.jpg/1280px-All_Gizah_Pyramids.jpg',
    coords: { lat: 29.9792, lng: 31.1342 },
  },
];

interface PanoramaxFeature {
  id?: string;
  geometry?: {
    coordinates?: [number, number];
  };
  assets?: {
    sd?: { href?: string };
    hd?: { href?: string };
    thumb?: { href?: string };
  };
}

interface PanoramaxResponse {
  features?: PanoramaxFeature[];
}

function pickRandom<T>(items: ReadonlyArray<T>): T {
  return items[Math.floor(Math.random() * items.length)];
}

function pickSeedRegion(usedIds: string[]): SeedRegion {
  const available = SEED_REGIONS.filter((r) => !usedIds.includes(r.id));
  const pool = available.length > 0 ? available : SEED_REGIONS;
  return pickRandom(pool);
}

function pickFallbackSpot(usedIds: string[]): GeoSpot {
  const available = FALLBACK_SPOTS.filter((s) => !usedIds.includes(s.id));
  const pool = available.length > 0 ? available : FALLBACK_SPOTS;
  return pickRandom(pool);
}

async function queryPanoramaxAround(region: SeedRegion): Promise<GeoSpot | null> {
  const jitterLat = region.lat + (Math.random() - 0.5) * 0.06;
  const jitterLng = region.lng + (Math.random() - 0.5) * 0.06;
  const params = new URLSearchParams({
    place_position: `${jitterLng.toFixed(5)},${jitterLat.toFixed(5)}`,
    place_distance: '0-8000',
    limit: '15',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`https://api.panoramax.xyz/api/search?${params.toString()}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TizenPartyGame/1.0 (GeoGuess Roulette)',
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as PanoramaxResponse;
    const candidates: GeoSpot[] = [];

    for (const feature of data.features ?? []) {
      const coords = feature.geometry?.coordinates;
      const imageUrl =
        feature.assets?.sd?.href ?? feature.assets?.hd?.href ?? feature.assets?.thumb?.href;
      if (!coords || coords.length < 2 || !imageUrl) continue;

      const [lng, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      candidates.push({
        id: region.id,
        label: region.label,
        imageUrl,
        coords: { lat, lng },
      });
    }

    if (candidates.length === 0) return null;
    return pickRandom(candidates);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRandomGeoSpot(usedIds: string[]): Promise<GeoSpot> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const region = pickSeedRegion(usedIds);
    const spot = await queryPanoramaxAround(region);
    if (spot) return spot;
  }
  return pickFallbackSpot(usedIds);
}
