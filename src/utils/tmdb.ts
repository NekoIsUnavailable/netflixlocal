const TMDB_API_KEY = '4f9f2f84e320ca3494c1fe586f3a5318';
const CACHE_KEY = 'tmdb_metadata_cache_v3';
const EP_CACHE_KEY = 'tmdb_episodes_cache_v1';

export interface TMDBResult {
  synopsis: string;
  poster: string | null;
  backdrop: string | null;
  genres: string[];
  rating: number;
  year: string | null;
  tvId?: number;
}

export async function getTMDBMetadata(title: string): Promise<TMDBResult | null> {
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
      cache[title] = null;
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
      year: year,
      tvId: first.media_type === 'tv' ? first.id : undefined
    };

    cache[title] = result;
    saveCache(cache);
    return result;
  } catch (err) {
    console.error('TMDB fetch error:', err);
    return null;
  }
}

export async function getTMDBEpisode(tvId: number, season: number, episode: number): Promise<string | null> {
  if (!navigator.onLine) return null;
  
  const key = `${tvId}_S${season}E${episode}`;
  let cache: Record<string, string | null> = {};
  try {
    const data = localStorage.getItem(EP_CACHE_KEY);
    if (data) cache = JSON.parse(data);
  } catch {}

  if (cache[key] !== undefined) return cache[key];

  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${season}/episode/${episode}?api_key=${TMDB_API_KEY}&language=en-US`);
    if (!res.ok) {
      cache[key] = null;
      localStorage.setItem(EP_CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    const data = await res.json();
    const synopsis = data.overview || null;
    cache[key] = synopsis;
    localStorage.setItem(EP_CACHE_KEY, JSON.stringify(cache));
    return synopsis;
  } catch (err) {
    return null;
  }
}

export function parseSeasonEpisode(filename: string): { season: number, episode: number } | null {
  const m1 = filename.match(/s(\d+)\s*e(\d+)/i);
  if (m1) return { season: parseInt(m1[1]), episode: parseInt(m1[2]) };
  
  const m2 = filename.match(/season\s*(\d+)\s*episode\s*(\d+)/i);
  if (m2) return { season: parseInt(m2[1]), episode: parseInt(m2[2]) };
  
  const m3 = filename.match(/(?:^|\s)(\d+)x(\d+)(?:\s|$)/i);
  if (m3) return { season: parseInt(m3[1]), episode: parseInt(m3[2]) };
  
  return null;
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
