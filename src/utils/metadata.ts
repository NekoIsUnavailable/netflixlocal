export interface MovieMeta {
  title: string;
  poster: string | null;
  description: string;
  year: string;
  genre: string;
}

export async function fetchMetadata(filename: string): Promise<MovieMeta> {
  // Clean filename: remove extension, dots, and years
  const cleanTitle = filename
    .replace(/\.[^/.]+$/, "") // remove extension
    .replace(/\./g, " ") // replace dots with spaces
    .replace(/\b(19|20)\d{2}\b.*$/, "") // remove year and everything after
    .replace(/\[.*?\]|\(.*?\)/g, "") // remove brackets/parentheses
    .trim();

  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanTitle)}&entity=movie&limit=1`);
    const data = await res.json();
    
    if (data.results && data.results.length > 0) {
      const movie = data.results[0];
      return {
        title: movie.trackName || cleanTitle,
        poster: movie.artworkUrl100?.replace('100x100bb', '600x600bb') || null,
        description: movie.longDescription || movie.shortDescription || 'No description available.',
        year: movie.releaseDate ? movie.releaseDate.substring(0, 4) : 'Unknown',
        genre: movie.primaryGenreName || 'Movie'
      };
    }
  } catch (error) {
    console.error("Failed to fetch metadata for", cleanTitle);
  }

  // Fallback
  return {
    title: cleanTitle,
    poster: null,
    description: 'A video file from your local library.',
    year: '',
    genre: 'Local Media'
  };
}
