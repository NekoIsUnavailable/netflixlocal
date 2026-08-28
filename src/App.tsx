import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchMetadata } from './utils/metadata';
import { generateVideoThumbnail } from './utils/thumbnail';
import { Play, Info, ChevronLeft, FolderSearch, Settings as SettingsIcon, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SettingsModal } from './components/SettingsModal';
import { ContentRow, DetailModal } from './components/NetflixUI';
import type { LocalFile } from './components/NetflixUI';

export default function App() {
  const [libraryPath, setLibraryPath] = useState(localStorage.getItem('netflix_library') || '');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<LocalFile | null>(null);
  const [infoVideo, setInfoVideo] = useState<LocalFile | null>(null);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    accentColor: '#E50914',
    wallpaperPath: '',
    overlayOpacity: 0.5,
    appName: 'NETFLIX',
    uiScale: 1.0,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const [showNextOverlay, setShowNextOverlay] = useState(false);

  // Load Settings
  useEffect(() => {
    const saved = localStorage.getItem('netflix_settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  // Apply Settings to CSS Variables
  useEffect(() => {
    document.documentElement.style.setProperty('--theme-accent', settings.accentColor);
    document.documentElement.style.setProperty('--theme-overlay-opacity', settings.overlayOpacity.toString());
    
    if (settings.wallpaperPath) {
      const formattedPath = `file:///${settings.wallpaperPath.replace(/\\/g, '/')}`;
      document.documentElement.style.setProperty('--theme-wallpaper', `url('${formattedPath}')`);
    } else {
      document.documentElement.style.removeProperty('--theme-wallpaper');
    }
    
    localStorage.setItem('netflix_settings', JSON.stringify(settings));
  }, [settings]);

  const scanLibrary = async () => {
    if (!window.electronAPI) {
      alert("Run this inside Electron!");
      return;
    }
    setLoading(true);
    const result = await window.electronAPI.scanDirectory(libraryPath);
    
    // Fetch metadata & thumbnails concurrently
    const enrichedFiles = await Promise.all(
      result.map(async (file: any) => {
        const meta = await fetchMetadata(file.name);
        let thumbnail = meta.poster;
        let duration = 0;
        
        const generated = await generateVideoThumbnail(file.path);
        if (generated) {
          duration = generated.duration;
          if (!thumbnail) thumbnail = generated.thumbnail;
        }

        return {
          ...file,
          meta,
          thumbnail,
          duration,
          dateModified: Date.now()
        };
      })
    );
    
    setFiles(enrichedFiles);
    setLoading(false);
  };

  const handleSelectFolder = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        setLibraryPath(folder);
        localStorage.setItem('netflix_library', folder);
      }
    }
  };

  useEffect(() => {
    if (libraryPath) {
      scanLibrary();
    }
  }, [libraryPath]);

  // Video Player Progress Tracking
  const handleTimeUpdate = () => {
    if (videoRef.current && playingVideo) {
      const { currentTime, duration } = videoRef.current;
      
      // Save progress to local storage
      const progress = JSON.parse(localStorage.getItem('netflix_progress') || '{}');
      progress[playingVideo.path] = currentTime;
      localStorage.setItem('netflix_progress', JSON.stringify(progress));

      // Show Next Overlay if in last 15 seconds
      if (duration - currentTime <= 15 && duration > 0) {
        setShowNextOverlay(true);
      } else {
        setShowNextOverlay(false);
      }
    }
  };

  const handleVideoLoaded = () => {
    if (videoRef.current && playingVideo) {
      const progress = JSON.parse(localStorage.getItem('netflix_progress') || '{}');
      if (progress[playingVideo.path]) {
        videoRef.current.currentTime = progress[playingVideo.path];
      }
    }
  };

  // Grouping for rows
  const { shows, movies } = useMemo(() => {
    // TV Shows: duration < 3600 seconds (1 hour)
    const shows = files.filter(f => (f.duration || 0) > 0 && (f.duration || 0) < 3600);
    // Movies: duration >= 3600 seconds
    const movies = files.filter(f => (f.duration || 0) >= 3600);

    return { shows, movies };
  }, [files]);

  // Pick a random featured item for Hero
  const featured = useMemo(() => {
    if (files.length === 0) return null;
    return files[Math.floor(Math.random() * files.length)];
  }, [files]);

  return (
    // @ts-ignore - zoom works in electron
    <div 
      className="text-white selection:bg-accent selection:text-white pb-20 flex flex-col min-h-screen bg-[#141414] overflow-x-hidden relative" 
      style={{ zoom: settings.uiScale, minHeight: `${100 / settings.uiScale}vh` }}
    >
      
      {/* Top Navbar */}
      <nav 
        className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-10 py-4 flex items-center justify-between pointer-events-none transition-all duration-300"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-8" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <h1 className="text-accent font-black text-4xl tracking-tighter pointer-events-auto shadow-black drop-shadow-md">{settings.appName}</h1>
          <ul className="hidden md:flex gap-5 text-sm font-semibold text-gray-200 pointer-events-auto">
            <li className="text-white drop-shadow-md cursor-pointer">Home</li>
            <li className="drop-shadow-md hover:text-gray-300 cursor-pointer transition">TV Shows</li>
            <li className="drop-shadow-md hover:text-gray-300 cursor-pointer transition">Movies</li>
          </ul>
        </div>
        
        <div className="pointer-events-auto flex items-center gap-6 pr-40" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <div className="flex items-center group relative cursor-pointer">
             <Search className="w-5 h-5 text-white" />
          </div>
          <div className="flex items-center bg-black/50 border border-white/20 rounded px-2 hover:bg-white/10 transition cursor-pointer" onClick={handleSelectFolder}>
            <FolderSearch className="w-4 h-4 text-gray-400 mr-2" />
            <button className="bg-transparent text-xs text-white py-2 outline-none">
              {libraryPath ? 'Change Library' : 'Select Library'}
            </button>
          </div>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-white/10 rounded-full transition"
          >
            <SettingsIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </nav>

      {!libraryPath ? (
        <div className="flex-grow flex flex-col items-center justify-center text-center px-4 relative z-10 pt-20">
          <h2 className="text-5xl md:text-6xl font-black tracking-tight mb-4 drop-shadow-md text-white">
            The Ultimate Local Media Engine.
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mb-12 drop-shadow-md">
            100% offline. Zero tracking. Just you and your media.<br/>
            Auto-play next episode, smart metadata, external player handoffs, and more.<br/>
            All dressed up in a gorgeous cinematic interface.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12 max-w-4xl w-full text-left">
            <div className="bg-black/50 p-6 rounded-lg border border-white/10 shadow-xl">
              <h3 className="text-xl font-bold mb-2 text-white flex items-center gap-2">🎬 External Players</h3>
              <p className="text-gray-400 text-sm">Got heavy 4K HDR x265 files? Instantly hand off playback to PotPlayer or VLC with zero stuttering.</p>
            </div>
            <div className="bg-black/50 p-6 rounded-lg border border-white/10 shadow-xl">
              <h3 className="text-xl font-bold mb-2 text-white flex items-center gap-2">⏭️ The Binge Engine</h3>
              <p className="text-gray-400 text-sm">Automatically queues up the next episode and remembers exactly where you left off. Just like the big guys.</p>
            </div>
            <div className="bg-black/50 p-6 rounded-lg border border-white/10 shadow-xl">
              <h3 className="text-xl font-bold mb-2 text-white flex items-center gap-2">🕵️‍♂️ Smart Clean-up</h3>
              <p className="text-gray-400 text-sm">Automatically cleans messy release names, fetches high-res artwork, and generates instant hover teasers.</p>
            </div>
          </div>

          <button 
            onClick={handleSelectFolder}
            className="bg-accent hover:bg-accent/80 text-white px-10 py-5 rounded font-bold text-2xl shadow-lg transition-all flex items-center gap-3 transform hover:scale-105"
          >
            <FolderSearch className="w-8 h-8" />
            Select Your Media Folder
          </button>
        </div>
      ) : loading ? (
        <div className="flex-grow flex items-center justify-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-accent border-solid shadow-lg"></div>
        </div>
      ) : files.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center text-center px-4 relative z-10 pt-20">
          <div className="w-24 h-24 mb-6 rounded-full bg-gray-800 flex items-center justify-center">
            <Search className="w-10 h-10 text-gray-500" />
          </div>
          <h2 className="text-3xl font-bold mb-2">No videos found</h2>
          <p className="text-gray-400 mb-8 max-w-md">
            We couldn't find any supported video files (.mp4, .mkv, .avi, etc.) in the selected folder.
          </p>
          <button 
            onClick={handleSelectFolder}
            className="border border-white/20 hover:bg-white/10 text-white px-6 py-2 rounded font-semibold transition"
          >
            Choose a different folder
          </button>
        </div>
      ) : (
        <>
          {/* Hero Banner with Ken Burns */}
          {featured && (
            <div className="relative w-full overflow-hidden" style={{ height: `${85 / settings.uiScale}vh` }}>
              {/* Ken Burns Image Wrapper */}
              <div className="absolute inset-0 w-full h-full">
                {featured.thumbnail ? (
                  <img 
                    src={featured.thumbnail} 
                    alt={featured.meta?.title || featured.name}
                    className="w-full h-full object-cover opacity-80 animate-ken-burns scale-110"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-gray-900 to-gray-800" />
                )}
              </div>
              
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
              
              <div className="absolute bottom-[25%] left-10 max-w-2xl z-10">
                <h1 className="text-5xl md:text-7xl font-bold mb-4 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
                  {featured.meta?.title || featured.name}
                </h1>
                <p className="text-lg md:text-xl text-gray-200 mb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-3 font-medium">
                  {featured.meta?.description || 'A local media file from your personal collection.'}
                </p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setPlayingVideo(featured)}
                    className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded text-xl font-bold hover:bg-white/80 transition"
                  >
                    <Play className="w-7 h-7 fill-black" /> Play
                  </button>
                  <button 
                    onClick={() => setInfoVideo(featured)}
                    className="flex items-center gap-2 bg-gray-500/70 text-white px-8 py-3 rounded text-xl font-bold hover:bg-gray-500/50 transition"
                  >
                    <Info className="w-7 h-7" /> More Info
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Carousel Rows */}
          <div className="px-2 -mt-32 relative z-10 flex-grow pb-20">
            <ContentRow title="Home" videos={files} onPlay={setPlayingVideo} onInfo={setInfoVideo} />
            {shows.length > 0 && (
              <ContentRow title="TV Shows" videos={shows} onPlay={setPlayingVideo} onInfo={setInfoVideo} />
            )}
            {movies.length > 0 && (
              <ContentRow title="Movies" videos={movies} onPlay={setPlayingVideo} onInfo={setInfoVideo} />
            )}
          </div>
        </>
      )}

      {/* Detail Modal */}
      {infoVideo && (
        <DetailModal video={infoVideo} onClose={() => setInfoVideo(null)} onPlay={(v) => { setInfoVideo(null); setPlayingVideo(v); }} />
      )}

      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black flex items-center justify-center group"
          >
            {/* Top Back Button (Fades out when controls hide natively) */}
            <div className="absolute top-0 left-0 w-full p-6 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition duration-300 z-[301]">
              <button 
                onClick={() => setPlayingVideo(null)}
                className="flex items-center gap-2 text-white hover:text-gray-300"
              >
                <ChevronLeft className="w-8 h-8" />
                <span className="text-xl font-bold">Back to Browse</span>
              </button>
            </div>
            
            <video 
              ref={videoRef}
              src={`file:///${playingVideo.path.replace(/\\/g, '/')}`} 
              controls 
              autoPlay 
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleVideoLoaded}
              className="w-full h-full outline-none"
            />

            {/* Next Episode Binge Overlay */}
            <AnimatePresence>
              {showNextOverlay && (
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  className="absolute bottom-24 right-10 bg-[#181818]/90 p-4 rounded shadow-2xl border border-gray-600/50 flex flex-col gap-2 z-[302] w-72"
                >
                  <p className="text-gray-300 font-bold text-sm">Next up in 15 seconds...</p>
                  <div className="text-white font-bold truncate">{playingVideo.meta?.title || playingVideo.name} (Replay)</div>
                  <button 
                    onClick={() => {
                      if(videoRef.current) {
                        videoRef.current.currentTime = 0;
                        videoRef.current.play();
                      }
                    }}
                    className="mt-2 flex items-center justify-center gap-2 bg-white text-black py-2 rounded font-bold hover:bg-gray-200 transition"
                  >
                    <Play className="w-4 h-4 fill-black" /> Watch Next
                  </button>
                  <button 
                    onClick={() => setShowNextOverlay(false)}
                    className="text-gray-400 text-xs text-center mt-1 hover:text-white"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal 
          currentSettings={settings}
          onSave={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Global Styles */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes kenBurns {
          0% { transform: scale(1.1); }
          50% { transform: scale(1.15) translate(-1%, -1%); }
          100% { transform: scale(1.1); }
        }
        .animate-ken-burns {
          animation: kenBurns 20s ease-in-out infinite alternate;
        }
      `}</style>
    </div>
  );
}
