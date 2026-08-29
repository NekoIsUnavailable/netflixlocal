import { useState, useRef, useEffect } from 'react';
import { Play, Plus, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
export interface LocalFile {
  name: string;
  path: string;
  relativePath?: string;
  meta?: { title?: string; description?: string; poster?: string; year?: string; genre?: string; };
  thumbnail?: string;
  duration?: number;
  dateModified?: number;
  localPoster?: string | null;
  localFanart?: string | null;
  localNfoContent?: string | null;
  folderName?: string;
  isFolder?: boolean;
  folderFiles?: LocalFile[];
}

// --- Detail Modal ---
export function DetailModal({ video, onClose, onPlay }: { video: LocalFile, onClose: () => void, onPlay: (v: LocalFile) => void }) {
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, []);

  const [selectedSubfolder, setSelectedSubfolder] = useState<string>('');

  const subfolders = useState(() => {
    if (!video.isFolder || !video.folderFiles) return {};
    const groups: Record<string, LocalFile[]> = {};
    video.folderFiles.forEach(f => {
      const parts = f.relativePath ? f.relativePath.split('/') : [];
      let sub = 'Episodes';
      if (parts.length > 2) {
        sub = parts[1];
      }
      if (!groups[sub]) groups[sub] = [];
      groups[sub].push(f);
    });
    return groups;
  })[0];

  const subfolderNames = Object.keys(subfolders).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
  
  useEffect(() => {
    if (subfolderNames.length > 0 && !selectedSubfolder) {
      setSelectedSubfolder(subfolderNames[0]);
    }
  }, [subfolderNames, selectedSubfolder]);

  const episodesToRender = subfolders[selectedSubfolder] || [];

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div 
          initial={{ y: 50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          className="bg-[#181818] w-full max-w-4xl rounded-lg shadow-2xl overflow-hidden relative my-10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-[#181818]/60 rounded-full hover:bg-white hover:text-black transition text-white border border-white/20">
             <X className="w-6 h-6" />
          </button>

          {/* Hero Image */}
          <div className="relative w-full aspect-[16/7]">
            {video.thumbnail ? (
              <img src={video.thumbnail} alt={video.meta?.title || video.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-800 to-black" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/20 to-transparent" />
            <div className="absolute bottom-6 left-10 max-w-2xl">
              <h2 className="text-4xl md:text-5xl font-bold text-white drop-shadow-md mb-6">{video.meta?.title || video.name}</h2>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    if (video.isFolder && video.folderFiles && video.folderFiles.length > 0) {
                      onPlay(episodesToRender[0] || video.folderFiles[0]);
                    } else {
                      onPlay(video);
                    }
                  }}
                  className="flex items-center gap-2 bg-white text-black px-8 py-2 rounded font-bold hover:bg-white/80 transition"
                >
                  <Play className="w-6 h-6 fill-black" /> Play
                </button>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="p-10 flex flex-col md:flex-row gap-12">
            <div className="flex-1">
              <div className="flex items-center gap-3 text-sm text-gray-400 font-semibold mb-6">
                <span className="text-green-400">98% Match</span>
                <span>{new Date(video.dateModified || Date.now()).getFullYear()}</span>
                <span className="border border-gray-600 px-1.5 py-0.5 rounded text-xs">HD</span>
              </div>
              <p className="text-gray-200 leading-relaxed text-lg mb-8">
                {video.meta?.description || 'No description available for this local file. This file was automatically indexed from your local folders.'}
              </p>

              {video.isFolder && subfolderNames.length > 0 && (
                <div className="mt-8 border-t border-gray-800 pt-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">Episodes</h3>
                    {subfolderNames.length > 1 && (
                      <select 
                        value={selectedSubfolder}
                        onChange={(e) => setSelectedSubfolder(e.target.value)}
                        className="bg-[#242424] text-white border border-gray-600 rounded px-4 py-2 font-semibold outline-none focus:border-white transition"
                      >
                        {subfolderNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
                    {episodesToRender.map((ep, i) => (
                      <div 
                        key={ep.path} 
                        className="flex items-center gap-4 p-4 rounded hover:bg-[#2b2b2b] transition cursor-pointer group border-b border-gray-800/50"
                        onClick={() => onPlay(ep)}
                      >
                        <div className="text-gray-400 font-bold w-6 text-xl">{i + 1}</div>
                        <div className="relative w-32 aspect-video bg-gray-800 rounded overflow-hidden flex-shrink-0">
                          {ep.thumbnail ? (
                            <img src={ep.thumbnail} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-600">No Image</div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                            <Play className="w-8 h-8 text-white fill-white" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-white font-bold mb-1">{ep.meta?.title || ep.name}</h4>
                          <p className="text-sm text-gray-400 line-clamp-2">{ep.meta?.description || 'No description.'}</p>
                        </div>
                        {ep.duration && (
                          <div className="text-gray-500 text-sm">{Math.floor(ep.duration / 60)}m</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="w-full md:w-1/3 text-sm text-gray-400 space-y-6">
              <div>
                <span className="text-gray-500 block mb-1">File Path:</span> 
                <div className="text-gray-300 break-all font-mono text-xs bg-black/20 p-2 rounded">{video.path}</div>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Genres:</span> 
                <span className="text-gray-300">Local Media, Personal, Video{video.isFolder ? ', Series' : ''}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// --- Video Card (Hover Jawlet) ---
export function VideoCard({ video, onPlay, onInfo, progress }: { video: LocalFile, onPlay: (v: LocalFile) => void, onInfo: (v: LocalFile) => void, progress?: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (video.isFolder) return;
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(true);
    }, 400); // 400ms debounce
  };

  const handleMouseLeave = () => {
    if (video.isFolder) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(false);
  };

  return (
    <div 
      className="relative flex-none w-64 aspect-video rounded-md cursor-pointer transition-transform duration-300 hover:z-50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => {
        if (video.isFolder) {
          onInfo(video);
        } else if (!isHovered) {
          onPlay(video); // Quick click = play
        }
      }}
    >
      {/* Base Card (Underneath) */}
      <div className="w-full h-full bg-gray-800 rounded-md overflow-hidden relative">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.meta?.title || video.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-2 text-center text-sm font-bold text-gray-400">
            {video.meta?.title || video.name}
          </div>
        )}
        <div className="absolute bottom-2 left-2 right-2 text-xs font-bold text-white truncate drop-shadow-md shadow-black">
          {video.meta?.title || video.name}
        </div>
        {/* Progress Bar */}
        {progress !== undefined && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
            <div className="h-full bg-red-600" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      {/* Expanded Hover Card (Jawlet) */}
      <AnimatePresence>
        {isHovered && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1.3 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[25%] w-full bg-[#181818] rounded-md shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] overflow-hidden border border-gray-700/50"
            style={{ transformOrigin: 'bottom center' }}
          >
            <div className="w-full aspect-video relative cursor-pointer" onClick={(e) => { e.stopPropagation(); onPlay(video); }}>
              <video 
                src={`file:///${video.path.replace(/\\/g, '/')}`} 
                autoPlay 
                muted 
                loop 
                className="w-full h-full object-cover"
                onLoadedMetadata={(e) => {
                  const v = e.target as HTMLVideoElement;
                  if (video.duration) v.currentTime = Math.floor(video.duration / 2); // Start playing from the middle!
                }}
              />
              {/* Play Overlay */}
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition">
                <Play className="w-10 h-10 text-white fill-white drop-shadow-lg" />
              </div>
            </div>
            
            <div className="p-4 flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); onPlay(video); }} className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition">
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  </button>
                  <button className="w-8 h-8 bg-transparent border-2 border-gray-500 rounded-full flex items-center justify-center hover:border-white transition text-white">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onInfo(video); }} className="w-8 h-8 bg-transparent border-2 border-gray-500 rounded-full flex items-center justify-center hover:border-white transition text-white">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-white font-semibold">
                <span className="text-green-400">98% Match</span>
                <span className="border border-gray-600 px-1 rounded text-gray-400">HD</span>
              </div>
              <div className="text-xs text-white font-bold line-clamp-2">
                {video.meta?.title || video.name}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Content Row (Carousel) ---
export function ContentRow({ title, videos, onPlay, onInfo, progresses = {}, isTop10 = false }: { title: string, videos: LocalFile[], onPlay: (v: LocalFile) => void, onInfo: (v: LocalFile) => void, progresses?: Record<string, number>, isTop10?: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5); // 5px buffer
    }
  };

  useEffect(() => {
    handleScroll();
    window.addEventListener('resize', handleScroll);
    return () => window.removeEventListener('resize', handleScroll);
  }, [videos]);

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      rowRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (videos.length === 0) return null;

  return (
    <div className="mb-8 relative group z-20 hover:z-50">
      <h2 className="text-xl md:text-2xl font-bold text-gray-200 mb-2 px-10 hover:text-white transition cursor-pointer flex items-center gap-2">
        {title}
        <ChevronRight className="w-5 h-5 text-transparent group-hover:text-white transition-all translate-x-[-10px] group-hover:translate-x-0" />
      </h2>
      
      {/* Left Arrow */}
      {showLeftArrow && (
        <div 
          className="absolute left-0 top-[10%] bottom-[10%] w-10 md:w-12 bg-black/50 z-40 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition hover:bg-black/80 rounded-r-md"
          onClick={() => scroll('left')}
        >
          <ChevronLeft className="w-8 h-8 text-white hover:scale-125 transition-transform" />
        </div>
      )}

      {/* Right Arrow */}
      {showRightArrow && (
        <div 
          className="absolute right-0 top-[10%] bottom-[10%] w-10 md:w-12 bg-black/50 z-40 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition hover:bg-black/80 rounded-l-md"
          onClick={() => scroll('right')}
        >
          <ChevronRight className="w-8 h-8 text-white hover:scale-125 transition-transform" />
        </div>
      )}

      <div 
        ref={rowRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto overflow-y-hidden px-10 py-32 -my-28 hide-scrollbar scroll-smooth"
      >
        {videos.map((video, i) => (
          <div key={`${video.path}-${i}`} className="flex items-end hover:z-50 relative">
            {isTop10 && (
              <svg viewBox="0 0 100 100" className="h-full w-auto max-h-[150px] -mr-6 z-10 fill-black stroke-gray-600 drop-shadow-[4px_0_10px_rgba(0,0,0,0.8)] stroke-[2px]">
                <text x="50" y="95" fontSize="100" fontWeight="900" textAnchor="middle">{i + 1}</text>
              </svg>
            )}
            <div className={isTop10 ? "z-20" : ""}>
              <VideoCard video={video} onPlay={onPlay} onInfo={onInfo} progress={progresses[video.path] !== undefined && video.duration ? progresses[video.path] / video.duration : 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
