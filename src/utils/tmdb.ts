const TMDB_API_KEY = '4f9f2f84e320ca3494c1fe586f3a5318';
const CACHE_KEY = 'tmdb_metadata_cache_v2';

export interface TMDBResult {
  synopsis: string;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  rating: number;
  year: string | null;
}

export async function getTMDBMetadata(title: string): Promise<TMDBResult | null> {
  // Only attempt fetch if online
  if (!navigator.onLine) return getCached(title);
  
  const cache = getFullCache();
  if (cache[title] !== undefined) {
    return cache[title];
  }

  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US&page=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      cache[title] = null; // cache negative result so we don't spam
      saveCache(cache);
      return null;
    }

    const first = data.results[0];
    const year = first.release_date ? first.release_date.substring(0, 4) : (first.first_air_date ? first.first_air_date.substring(0, 4) : null);
    const result: TMDBResult = {
      synopsis: first.overview || '',
      poster: first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null,
      backdrop: first.backdrop_path ? `https://image.tmdb.org/t/p/w1280${first.backdrop_path}` : null,
      genres: [],
      rating: first.vote_average || 0,
      year: year
    };

    cache[title] = result;
    saveCache(cache);
    return result;
  } catch (err) {
    console.error('TMDB fetch error:', err);
    return null;
  }
}

function getFullCache(): Record<string, TMDBResult | null> {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, TMDBResult | null>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save TMDB cache. Possibly full.', e);
  }
}

export function getCached(title: string): TMDBResult | null {
  const cache = getFullCache();
  return cache[title] || null;
}
