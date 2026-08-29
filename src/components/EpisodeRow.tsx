import { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import type { LocalFile } from './NetflixUI';
import { getTMDBEpisode, parseSeasonEpisode } from '../utils/tmdb';

export function EpisodeRow({ ep, index, seriesTvId, onPlay }: { ep: LocalFile, index: number, seriesTvId?: number, onPlay: (ep: LocalFile) => void }) {
  const [synopsis, setSynopsis] = useState<string | null>(null);

  useEffect(() => {
    if (seriesTvId) {
      const parsed = parseSeasonEpisode(ep.name) || parseSeasonEpisode(ep.relativePath || '');
      if (parsed) {
        getTMDBEpisode(seriesTvId, parsed.season, parsed.episode).then(res => {
          if (res) setSynopsis(res);
        });
      }
    }
  }, [seriesTvId, ep]);

  return (
    <div 
      className="flex items-center gap-4 p-4 rounded hover:bg-[#2b2b2b] transition cursor-pointer group border-b border-gray-800/50"
      onClick={() => onPlay(ep)}
    >
      <div className="text-gray-400 font-bold w-6 text-xl">{index + 1}</div>
      <div className="relative w-32 aspect-video bg-gray-800 rounded overflow-hidden flex-shrink-0">
        {ep.thumbnail ? (
          <img src={ep.thumbnail} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-gray-600 p-2 text-center">No Image</div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
          <Play className="w-8 h-8 text-white fill-white" />
        </div>
      </div>
      <div className="flex-1">
        <h4 className="text-white font-bold mb-1">{ep.meta?.title || ep.name}</h4>
        <p className="text-sm text-gray-400 line-clamp-2">
          {synopsis || ep.meta?.description || 'A video file from your local library.'}
        </p>
      </div>
      {ep.duration && (
        <div className="text-gray-500 text-sm">{Math.floor(ep.duration / 60)}m</div>
      )}
    </div>
  );
}
