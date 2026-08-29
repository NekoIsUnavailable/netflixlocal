import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchMetadata } from './utils/metadata';
import { generateVideoThumbnail } from './utils/thumbnail';
import { Play, Info, ChevronLeft, FolderSearch, Settings as SettingsIcon, Search, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SettingsModal } from './components/SettingsModal';
import { ContentRow, DetailModal } from './components/NetflixUI';
import type { LocalFile } from './components/NetflixUI';
import { StartupScreen } from './components/StartupScreen';
import { ProfilesScreen } from './components/ProfilesScreen';

export default function App() {
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'home' | 'tv' | 'movies'>('home');
  const [libraryPath, setLibraryPath] = useState(localStorage.getItem('netflix_library') || '');

  const [files, setFiles] = useState<LocalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<LocalFile | null>(null);
  const [infoVideo, setInfoVideo] = useState<LocalFile | null>(null);
  const [showStartup, setShowStartup] = useState(true);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    accentColor: '#fdbce6',
    wallpaperPath: '',
    overlayOpacity: 0.5,
    appName: 'Kudflix',
    uiScale: 1.0,
    useExternalPlayer: false,
    externalPlayerPath: '',
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  const [progresses, setProgresses] = useState<Record<string, number>>({});

  // Load Settings and Progress
  useEffect(() => {
    const saved = localStorage.getItem('netflix_settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (activeProfile) {
      const savedProg = localStorage.getItem(`netflix_progress_${activeProfile}`);
      if (savedProg) {
        setProgresses(JSON.parse(savedProg));
      } else {
        setProgresses({});
      }
    }
  }, [activeProfile]);



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
    if (!libraryPath) return;

    if (!window.electronAPI) {
      alert("Run this inside Electron!");
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.scanDirectory(libraryPath);
      
      // Fetch metadata & thumbnails concurrently
      const enrichedFiles = await Promise.all(
        result.map(async (file: any) => {
          let meta: { title: string; description: string; poster: string | null; year: string; genre: string } = { title: file.name, description: 'A video file from your local library.', poster: null, year: '', genre: '' };
          
          if (file.localNfoContent) {
            const titleMatch = file.localNfoContent.match(/<title>(.*?)<\/title>/i);
            const plotMatch = file.localNfoContent.match(/<plot>(.*?)<\/plot>/i);
            const yearMatch = file.localNfoContent.match(/<year>(.*?)<\/year>/i);
            const genreMatch = file.localNfoContent.match(/<genre>(.*?)<\/genre>/i);
            
            if (titleMatch) meta.title = titleMatch[1];
            if (plotMatch) meta.description = plotMatch[1];
            if (yearMatch) meta.year = yearMatch[1];
            if (genreMatch) meta.genre = genreMatch[1];
          } else {
            meta = await fetchMetadata(file.name);
          }
          
          let duration = 0;
          let thumbnail = file.localFanart || file.localPoster || meta.poster;

          // Only generate ffmpeg thumbnail if we have absolutely no artwork
          let skipThumbnail = false;
          if (file.localPoster || file.localFanart) {
            skipThumbnail = true;
          }
          
          const generated = await generateVideoThumbnail(file.path, skipThumbnail);
          if (generated) {
            duration = generated.duration;
            if (!thumbnail && !skipThumbnail) thumbnail = generated.thumbnail;
          }

          return { ...file, meta, thumbnail, duration, dateModified: Date.now() };
        })
      );
      
      setFiles(enrichedFiles);
    } catch (err) {
      console.error(err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
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
    } else {
      setFiles([]);
    }
  }, [libraryPath]);

  const handlePlayVideo = (video: LocalFile) => {
    // Increment play count for Top 10
    if (activeProfile) {
      const counts = JSON.parse(localStorage.getItem(`netflix_playcounts_${activeProfile}`) || '{}');
      counts[video.path] = (counts[video.path] || 0) + 1;
      localStorage.setItem(`netflix_playcounts_${activeProfile}`, JSON.stringify(counts));
    }
    
    if (settings.useExternalPlayer && settings.externalPlayerPath && window.electronAPI && window.electronAPI.playInExternalPlayer) {
      window.electronAPI.playInExternalPlayer(settings.externalPlayerPath, video.path);
    } else {
      setPlayingVideo(video);
    }
  };



  // Video Player Progress Tracking
  const handleTimeUpdate = () => {
    if (videoRef.current && playingVideo && activeProfile) {
      const { currentTime, duration } = videoRef.current;
      
      // Save progress to local storage
      const progress = JSON.parse(localStorage.getItem(`netflix_progress_${activeProfile}`) || '{}');
      progress[playingVideo.path] = currentTime;
      localStorage.setItem(`netflix_progress_${activeProfile}`, JSON.stringify(progress));
      setProgresses(progress);

      // Show Next Overlay if in last 15 seconds
      if (duration - currentTime <= 15 && duration > 0) {
        setShowNextOverlay(true);
      } else {
        setShowNextOverlay(false);
      }
    }
  };

  const handleVideoLoaded = () => {
    if (videoRef.current && playingVideo && activeProfile) {
      const progress = JSON.parse(localStorage.getItem(`netflix_progress_${activeProfile}`) || '{}');
      if (progress[playingVideo.path]) {
        videoRef.current.currentTime = progress[playingVideo.path];
      }
    }
  };

  const getNextEpisode = (currentVideo: LocalFile | null) => {
    if (!currentVideo) return null;
    const match = currentVideo.name.match(/(.*?)(s\d+e)(\d+)/i);
    if (!match) return null;

    const prefix = match[1];
    const s_e = match[2];
    const episodeNum = parseInt(match[3], 10);
    
    const nextEpStr = (episodeNum + 1).toString().padStart(match[3].length, '0');
    // Escape prefix for regex
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextRegex = new RegExp(`^${escapedPrefix}${s_e}${nextEpStr}`, 'i');
    
    return files.find(f => nextRegex.test(f.name)) || null;
  };

  // Grouping for rows
  const { shows, movies, continueWatching, top10, collections, folders } = useMemo(() => {
    // TV Shows: duration < 3600 seconds (1 hour)
    const shows = files.filter(f => (f.duration || 0) > 0 && (f.duration || 0) < 3600);
    // Movies: duration >= 3600 seconds
    const movies = files.filter(f => (f.duration || 0) >= 3600);

    // Continue Watching
    const continueWatching = files.filter(f => progresses[f.path] && progresses[f.path] > 5 && (!f.duration || progresses[f.path] < f.duration - 30));

    // Top 10
    const counts = JSON.parse(localStorage.getItem(`netflix_playcounts_${activeProfile}`) || '{}');
    const top10 = [...files]
      .filter(f => counts[f.path] > 0)
      .sort((a, b) => (counts[b.path] || 0) - (counts[a.path] || 0))
      .slice(0, 10);

    // Smart Collections (by Genre and Folder)
    const genreMap = new Map<string, LocalFile[]>();
    const folderMap = new Map<string, LocalFile[]>();
    const rootFolders = new Map<string, LocalFile[]>();

    files.forEach(f => {
      if (f.relativePath) {
        const parts = f.relativePath.split('/');
        if (parts.length > 1) {
          const root = parts[0];
          if (!rootFolders.has(root)) rootFolders.set(root, []);
          rootFolders.get(root)!.push(f);
        }
      }
    });

    const folderPseudoFiles: LocalFile[] = Array.from(rootFolders.entries()).map(([root, fList]) => ({
      name: root,
      path: `folder://${root}`,
      isFolder: true,
      folderFiles: fList.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
      thumbnail: fList[0].thumbnail || fList[0].localFanart || fList[0].localPoster || undefined,
      meta: {
        title: root,
        description: `A collection of ${fList.length} video files inside the ${root} folder.`,
      },
      dateModified: Date.now()
    }));

    movies.forEach(m => {
      // Genre
      const g = m.meta?.genre;
      if (g && g !== 'Movie' && g !== 'Local Media') {
        const primary = g.split(',')[0].trim();
        if (!genreMap.has(primary)) genreMap.set(primary, []);
        genreMap.get(primary)!.push(m);
      }

      // Folder (Franchise)
      if (m.folderName) {
        if (!folderMap.has(m.folderName)) folderMap.set(m.folderName, []);
        folderMap.get(m.folderName)!.push(m);
      }
    });

    const collections = Array.from(genreMap.entries())
      .filter(([_, v]) => v.length >= 2) // only collections with at least 2 items
      .map(([k, v]) => ({ title: `${k} Movies`, videos: v }));

    const franchises = Array.from(folderMap.entries())
      .filter(([_, v]) => v.length >= 2) // > 1 movie in a subfolder = Franchise!
      .map(([k, v]) => ({ title: `${k} Collection`, videos: v }));

    return { shows, movies, continueWatching, top10, collections: [...franchises, ...collections], folders: folderPseudoFiles };
  }, [files, progresses, activeProfile]);

  // Dynamic Hero Banner
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [delayOver, setDelayOver] = useState(false);
  const [isHeroMuted, setIsHeroMuted] = useState(true);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  
  const featured = files.length > 0 ? files[featuredIndex % files.length] : null;

  // 1. Initial 3s delay on image
  useEffect(() => {
    if (!featured) return;
    
    setDelayOver(false);
    setIsVideoPlaying(false);
    
    const t = setTimeout(() => {
      setDelayOver(true);
    }, 3000);
    
    return () => clearTimeout(t);
  }, [featuredIndex, files.length, featured?.path]);

  // 2. Play when mounted
  useEffect(() => {
    if (delayOver && heroVideoRef.current) {
      heroVideoRef.current.play().catch(e => {
        console.error("Play failed:", e);
      });
    }
  }, [delayOver]);

  const handleHeroTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    
    // Safety fallback: if video is advancing, it is playing
    if (video.currentTime > 0.1 && !isVideoPlaying) {
      setIsVideoPlaying(true);
    }
    
    if (video.currentTime >= 15) {
      // End of preview
      setDelayOver(false);
      setIsVideoPlaying(false);
      
      // Wait 5s on image, then cycle
      setTimeout(() => {
        setFeaturedIndex((prev) => (prev + 1) % files.length);
      }, 5000);
    }
  };


  return (
    // @ts-ignore - zoom works in electron
    <div 
      className="text-white selection:bg-accent selection:text-white pb-20 flex flex-col min-h-screen bg-[#141414] overflow-x-hidden relative" 
      style={{ zoom: settings.uiScale, minHeight: `${100 / settings.uiScale}vh` }}
    >
      
      {/* Startup Screen */}
      {showStartup && (
        <StartupScreen 
          onComplete={() => setShowStartup(false)} 
          appName={settings.appName} 
          accentColor={settings.accentColor} 
        />
      )}

      {/* Profiles Screen */}
      {!showStartup && !activeProfile && (
        <ProfilesScreen onSelect={setActiveProfile} />
      )}

      {/* Main App Body (Only render if profile selected) */}
      {activeProfile && (
        <>
          {/* Top Navbar */}
            <nav 
              className="fixed top-0 w-full z-50 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-10 py-4 flex items-center justify-between pointer-events-none transition-all duration-300"
              style={{ WebkitAppRegion: 'drag' } as any}
            >
              <div className="flex items-center gap-8" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <h1 className="text-accent font-black text-2xl tracking-tighter pointer-events-auto shadow-black drop-shadow-md">{settings.appName}</h1>
                <ul className="hidden md:flex gap-5 text-sm font-semibold text-gray-200 pointer-events-auto">
                  <li onClick={() => setActiveTab('home')} className={`drop-shadow-md cursor-pointer transition ${activeTab === 'home' ? 'text-white' : 'hover:text-gray-300'}`}>Home</li>
                  <li onClick={() => setActiveTab('tv')} className={`drop-shadow-md cursor-pointer transition ${activeTab === 'tv' ? 'text-white' : 'hover:text-gray-300'}`}>TV Shows</li>
                  <li onClick={() => setActiveTab('movies')} className={`drop-shadow-md cursor-pointer transition ${activeTab === 'movies' ? 'text-white' : 'hover:text-gray-300'}`}>Movies</li>
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
              {/* Profile Switcher */}
              <button 
                onClick={() => setActiveProfile(null)}
                className="p-1 hover:bg-white/10 rounded transition"
              >
                <img 
                  src={
                    (() => {
                      const p = JSON.parse(localStorage.getItem('netflix_profiles') || '[]').find((p: any) => p.id === activeProfile);
                      if (!p || p.avatar.includes('api.dicebear.com') || p.avatar.includes('./avatars/avatar')) return './avatars/key1.jpg';
                      return p.avatar;
                    })()
                  } 
                  className="w-8 h-8 rounded object-cover border border-gray-700" 
                  alt="Profile" 
                />
              </button>
            </div>
          </nav>

      {!libraryPath ? (
        <div className="flex-grow flex flex-col items-center justify-center text-center px-4 relative z-10 pt-20">
          <button 
            onClick={handleSelectFolder}
            className="mt-6 flex items-center justify-center gap-2 bg-accent text-white px-8 py-4 rounded font-bold text-xl hover:bg-red-700 transition shadow-lg hover:scale-105 active:scale-95"
          >
            <FolderSearch className="w-6 h-6" />
            Select Library Folder
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
                  {/* Image and Video Wrapper */}
                  <div className="absolute inset-0 w-full h-full bg-gray-900">
                    {/* Static Image */}
                    <div 
                      className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${isVideoPlaying ? 'opacity-0' : 'opacity-100'}`}
                    >
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
  
                    {/* Video Preview */}
                    <div 
                      className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${isVideoPlaying ? 'opacity-100' : 'opacity-0'}`}
                    >
                      {delayOver && (
                        <video
                          ref={heroVideoRef}
                          src={`file:///${featured.path.replace(/\\/g, '/')}`}
                          autoPlay
                          muted={isHeroMuted}
                          onPlay={() => setIsVideoPlaying(true)}
                          onTimeUpdate={handleHeroTimeUpdate}
                          onEnded={() => setIsVideoPlaying(false)}
                          className="w-full h-full object-cover opacity-80"
                        />
                      )}
                    </div>
                  </div>
              
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
              
                <div className="absolute bottom-[25%] left-10 right-10 z-10 flex justify-between items-end">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={featured.path}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.5 }}
                      className="max-w-2xl"
                    >
                      <h1 className="text-5xl md:text-7xl font-bold mb-4 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
                        {featured.meta?.title || featured.name}
                      </h1>
                      <p className="text-lg md:text-xl text-gray-200 mb-8 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-3 font-medium">
                        {featured.meta?.description || 'A local media file from your personal collection.'}
                      </p>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => handlePlayVideo(featured)}
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
                    </motion.div>
                  </AnimatePresence>
                  
                  {/* Mute Toggle Button */}
                  <button 
                    onClick={() => setIsHeroMuted(!isHeroMuted)}
                    className="p-3 border rounded-full border-gray-400 bg-black/40 hover:bg-white/20 transition text-white mb-8"
                  >
                    {isHeroMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                  </button>
                </div>
            </div>
          )}

          {/* Carousel Rows */}
          <div className="px-2 -mt-32 relative z-10 flex-grow pb-20">
            {activeTab === 'home' && top10.length > 0 && (
              <ContentRow title="Top 10 in Your House Today" videos={top10} onPlay={handlePlayVideo} onInfo={setInfoVideo} isTop10={true} />
            )}
            {(activeTab === 'home' || activeTab === 'tv') && continueWatching.length > 0 && (
              <ContentRow title="Continue Watching" videos={continueWatching} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}
            
            {activeTab === 'home' && (
              <ContentRow title="Home" videos={files} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}
            
            {(activeTab === 'home' || activeTab === 'tv') && folders.length > 0 && (
              <ContentRow title="Series" videos={folders} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}

            {(activeTab === 'home' || activeTab === 'tv') && shows.length > 0 && (
              <ContentRow title="TV Shows (All)" videos={shows} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}
            
            {(activeTab === 'home' || activeTab === 'movies') && movies.length > 0 && (
              <ContentRow title="Movies" videos={movies} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}
            
            {collections.map(c => (
              <ContentRow key={c.title} title={c.title} videos={c.videos} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            ))}
          </div>
        </>
      )}

      {/* Detail Modal */}
      {infoVideo && (
        <DetailModal video={infoVideo} onClose={() => setInfoVideo(null)} onPlay={(v) => { setInfoVideo(null); handlePlayVideo(v); }} />
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
              {showNextOverlay && getNextEpisode(playingVideo) && (
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  className="absolute bottom-24 right-10 bg-[#181818]/90 p-4 rounded shadow-2xl border border-gray-600/50 flex flex-col gap-2 z-[302] w-72"
                >
                  <p className="text-gray-300 font-bold text-sm">Next episode in 15 seconds...</p>
                  <div className="text-white font-bold truncate">{getNextEpisode(playingVideo)?.meta?.title || getNextEpisode(playingVideo)?.name}</div>
                  <button 
                    onClick={() => {
                      const next = getNextEpisode(playingVideo);
                      if (next) {
                        setShowNextOverlay(false);
                        handlePlayVideo(next);
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
      
        </>
      )}

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
