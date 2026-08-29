import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchMetadata } from './utils/metadata';
import { generateVideoThumbnail } from './utils/thumbnail';
import { Play, Info, ChevronLeft, FolderSearch, Settings as SettingsIcon, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SettingsModal } from './components/SettingsModal';
import { ContentRow, DetailModal } from './components/NetflixUI';
import type { LocalFile } from './components/NetflixUI';
import { StartupScreen } from './components/StartupScreen';
import { ProfilesScreen } from './components/ProfilesScreen';

type AppSettings = {
  accentColor: string;
  wallpaperPath: string;
  overlayOpacity: number;
  appName: string;
  uiScale: number;
  useExternalPlayer: boolean;
  externalPlayerPath: string;
  allowOnlineMetadata: boolean;
};

type IndexedLocalFile = LocalFile & {
  size: number;
  mtimeMs: number;
};

const DEFAULT_SETTINGS: AppSettings = {
  accentColor: '#E50914',
  wallpaperPath: '',
  overlayOpacity: 0.5,
  appName: 'NetflixLocal',
  uiScale: 1.0,
  useExternalPlayer: false,
  externalPlayerPath: '',
  allowOnlineMetadata: false,
};

const getLibraryCacheKey = (libraryPath: string) => `netflix_media_index_${encodeURIComponent(libraryPath)}`;
const toLocalUri = (targetPath: string) => `local://${encodeURIComponent(targetPath)}`;

const parseNfoMeta = (nfoContent: string, fallbackTitle: string) => {
  const titleMatch = nfoContent.match(/<title>(.*?)<\/title>/i);
  const plotMatch = nfoContent.match(/<plot>(.*?)<\/plot>/i);
  const yearMatch = nfoContent.match(/<year>(.*?)<\/year>/i);
  const genreMatch = nfoContent.match(/<genre>(.*?)<\/genre>/i);
  return {
    title: titleMatch?.[1] || fallbackTitle,
    description: plotMatch?.[1] || 'A video file from your local library.',
    poster: null,
    year: yearMatch?.[1] || '',
    genre: genreMatch?.[1] || 'Local Media',
  };
};

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) => {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
  return results;
};

export default function App() {
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [libraryPath, setLibraryPath] = useState(localStorage.getItem('netflix_library') || '');
  const [files, setFiles] = useState<IndexedLocalFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<LocalFile | null>(null);
  const [infoVideo, setInfoVideo] = useState<LocalFile | null>(null);
  const [showStartup, setShowStartup] = useState(true);
  const [scanStatus, setScanStatus] = useState({
    scannedCount: 0,
    mediaCount: 0,
    done: true,
    hitScanLimit: false,
    error: false,
    enrichedCount: 0,
    toEnrichCount: 0,
  });
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  const [progresses, setProgresses] = useState<Record<string, number>>({});
  const scanRunIdRef = useRef(0);
  const progressBufferRef = useRef<Record<string, number>>({});
  const progressSaveTimeoutRef = useRef<number | null>(null);

  // Load Settings and Progress
  useEffect(() => {
    const saved = localStorage.getItem('netflix_settings');
    if (saved) {
      setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
    }
  }, []);

  useEffect(() => {
    if (activeProfile) {
      const savedProg = localStorage.getItem(`netflix_progress_${activeProfile}`);
      if (savedProg) {
        const parsed = JSON.parse(savedProg);
        setProgresses(parsed);
        progressBufferRef.current = parsed;
      } else {
        setProgresses({});
        progressBufferRef.current = {};
      }
    }
  }, [activeProfile]);

  // Apply Settings to CSS Variables
  useEffect(() => {
    document.documentElement.style.setProperty('--theme-accent', settings.accentColor);
    document.documentElement.style.setProperty('--theme-overlay-opacity', settings.overlayOpacity.toString());
    
    if (settings.wallpaperPath) {
      const formattedPath = toLocalUri(settings.wallpaperPath);
      document.documentElement.style.setProperty('--theme-wallpaper', `url('${formattedPath}')`);
    } else {
      document.documentElement.style.removeProperty('--theme-wallpaper');
    }
    
    localStorage.setItem('netflix_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!window.electronAPI?.onScanProgress || !window.electronAPI?.offScanProgress) return;
    const handler = window.electronAPI.onScanProgress((payload) => {
      setScanStatus((prev) => ({
        ...prev,
        scannedCount: payload.scannedCount ?? prev.scannedCount,
        mediaCount: payload.mediaCount ?? prev.mediaCount,
        done: payload.done ?? prev.done,
        hitScanLimit: payload.hitScanLimit ?? prev.hitScanLimit,
        error: payload.error ?? false,
      }));
    });
    return () => {
      window.electronAPI.offScanProgress(handler);
    };
  }, []);

  const flushProgress = () => {
    if (!activeProfile) return;
    localStorage.setItem(`netflix_progress_${activeProfile}`, JSON.stringify(progressBufferRef.current));
  };

  const scheduleProgressFlush = () => {
    if (progressSaveTimeoutRef.current) {
      window.clearTimeout(progressSaveTimeoutRef.current);
    }
    progressSaveTimeoutRef.current = window.setTimeout(() => {
      flushProgress();
      progressSaveTimeoutRef.current = null;
    }, 900);
  };

  const cancelScan = () => {
    scanRunIdRef.current += 1;
    setLoading(false);
    setScanStatus((prev) => ({ ...prev, done: true }));
  };

  const scanLibrary = async () => {
    if (!window.electronAPI) {
      alert("Run this inside Electron!");
      return;
    }
    const runId = ++scanRunIdRef.current;
    setLoading(true);
    setScanStatus({
      scannedCount: 0,
      mediaCount: 0,
      done: false,
      hitScanLimit: false,
      error: false,
      enrichedCount: 0,
      toEnrichCount: 0,
    });

    const result = await window.electronAPI.scanDirectory(libraryPath);
    if (runId !== scanRunIdRef.current) return;

    const cacheKey = getLibraryCacheKey(libraryPath);
    const cachedRaw = localStorage.getItem(cacheKey);
    let cachedFiles: IndexedLocalFile[] = [];
    if (cachedRaw) {
      try {
        cachedFiles = JSON.parse(cachedRaw);
      } catch {
        localStorage.removeItem(cacheKey);
      }
    }
    const cacheByPath = new Map(cachedFiles.map((f) => [f.path, f]));

    const unchanged: IndexedLocalFile[] = [];
    const toEnrich: typeof result = [];

    result.forEach((file) => {
      const cached = cacheByPath.get(file.path);
      if (cached && cached.size === file.size && cached.mtimeMs === file.mtimeMs) {
        unchanged.push({
          ...cached,
          localPoster: file.localPoster,
          localFanart: file.localFanart,
          localNfoContent: file.localNfoContent,
          folderName: file.folderName,
        });
      } else {
        toEnrich.push(file);
      }
    });

    setScanStatus((prev) => ({ ...prev, toEnrichCount: toEnrich.length }));

    const enriched = await runWithConcurrency(toEnrich, 4, async (file, index) => {
      if (runId !== scanRunIdRef.current) return null;

      let meta = {
        title: file.name,
        description: 'A video file from your local library.',
        poster: null as string | null,
        year: '',
        genre: 'Local Media',
      };

      if (file.localNfoContent) {
        meta = parseNfoMeta(file.localNfoContent, file.name);
      } else if (settings.allowOnlineMetadata) {
        meta = await fetchMetadata(file.name);
      }

      let thumbnail = file.localFanart || file.localPoster || meta.poster;
      const skipThumbnail = Boolean(file.localPoster || file.localFanart);
      const generated = await generateVideoThumbnail(file.path, skipThumbnail);
      const duration = generated?.duration || 0;
      if (!thumbnail && !skipThumbnail) {
        thumbnail = generated?.thumbnail || null;
      }

      setScanStatus((prev) => ({ ...prev, enrichedCount: index + 1 }));

      return {
        ...file,
        meta,
        thumbnail,
        duration,
        dateModified: Date.now(),
      } as IndexedLocalFile;
    });

    if (runId !== scanRunIdRef.current) return;

    const merged = [...unchanged, ...enriched.filter((item): item is IndexedLocalFile => Boolean(item))]
      .sort((a, b) => a.path.localeCompare(b.path));

    setFiles(merged);
    localStorage.setItem(cacheKey, JSON.stringify(merged));
    setLoading(false);
    setScanStatus((prev) => ({ ...prev, done: true }));
  };

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

  const handleSelectFolder = async () => {
    if (window.electronAPI && window.electronAPI.selectFolder) {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        cancelScan();
        setLibraryPath(folder);
        localStorage.setItem('netflix_library', folder);
      }
    }
  };

  useEffect(() => {
    if (libraryPath) {
      const cachedRaw = localStorage.getItem(getLibraryCacheKey(libraryPath));
      if (cachedRaw) {
        try {
          setFiles(JSON.parse(cachedRaw));
        } catch {
          localStorage.removeItem(getLibraryCacheKey(libraryPath));
        }
      }
      scanLibrary();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryPath]);

  // Video Player Progress Tracking
  const handleTimeUpdate = () => {
    if (videoRef.current && playingVideo && activeProfile) {
      const { currentTime, duration } = videoRef.current;

      const progress = {
        ...progressBufferRef.current,
        [playingVideo.path]: currentTime,
      };
      progressBufferRef.current = progress;
      setProgresses(progress);
      scheduleProgressFlush();

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
      const progress = progressBufferRef.current;
      if (progress[playingVideo.path]) {
        videoRef.current.currentTime = progress[playingVideo.path];
      }
    }
  };

  const nextEpisodeByPath = useMemo(() => {
    const grouped = new Map<string, { episode: number; file: IndexedLocalFile }[]>();
    for (const file of files) {
      const match = file.name.match(/(.*?)(s\d+e)(\d+)/i);
      if (!match) continue;
      const key = `${match[1].trim().toLowerCase()}-${match[2].toLowerCase()}`;
      const episode = parseInt(match[3], 10);
      if (!Number.isFinite(episode)) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push({ episode, file });
    }

    const lookup = new Map<string, IndexedLocalFile>();
    for (const [, entries] of grouped) {
      entries.sort((a, b) => a.episode - b.episode);
      for (let i = 0; i < entries.length - 1; i += 1) {
        lookup.set(entries[i].file.path, entries[i + 1].file);
      }
    }
    return lookup;
  }, [files]);

  const nextEpisode = useMemo(
    () => (playingVideo ? nextEpisodeByPath.get(playingVideo.path) || null : null),
    [playingVideo, nextEpisodeByPath]
  );

  useEffect(() => {
    const onBeforeUnload = () => {
      flushProgress();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [activeProfile]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else if (infoVideo) setInfoVideo(null);
        else if (playingVideo) {
          flushProgress();
          setPlayingVideo(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSettings, infoVideo, playingVideo, activeProfile]);

  // Grouping for rows
  const { shows, movies, continueWatching, top10, collections } = useMemo(() => {
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

    return { shows, movies, continueWatching, top10, collections: [...franchises, ...collections] };
  }, [files, progresses, activeProfile]);

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
              {/* Profile Switcher */}
              <button 
                onClick={() => setActiveProfile(null)}
                className="p-1 hover:bg-white/10 rounded transition"
              >
                <div className="w-8 h-8 rounded bg-gray-700 text-white text-xs font-bold flex items-center justify-center">
                  {(activeProfile || 'P').slice(0, 1).toUpperCase()}
                </div>
              </button>
            </div>
          </nav>

      {!libraryPath ? (
        <div className="flex-grow flex flex-col items-center justify-center text-center px-4 relative z-10 pt-20">
          <button 
            onClick={handleSelectFolder}
            className="bg-accent hover:bg-accent/80 text-white px-10 py-5 rounded font-bold text-2xl shadow-lg transition-all flex items-center gap-3 transform hover:scale-105"
          >
            <FolderSearch className="w-8 h-8" />
            Select Media Folder
          </button>
        </div>
      ) : loading ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-4 text-center px-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-accent border-solid shadow-lg"></div>
          <p className="text-sm text-gray-300">
            Scanned {scanStatus.scannedCount.toLocaleString()} entries • Found {scanStatus.mediaCount.toLocaleString()} videos
          </p>
          {scanStatus.toEnrichCount > 0 && (
            <p className="text-xs text-gray-400">
              Enriched {Math.min(scanStatus.enrichedCount, scanStatus.toEnrichCount).toLocaleString()} / {scanStatus.toEnrichCount.toLocaleString()}
            </p>
          )}
          <button
            onClick={cancelScan}
            className="border border-gray-500 text-gray-300 px-4 py-2 rounded hover:text-white hover:border-white transition"
          >
            Cancel Scan
          </button>
          {scanStatus.hitScanLimit && (
            <p className="text-xs text-yellow-400">Scan limit reached; narrow your folder or rescan subfolders.</p>
          )}
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
              </div>
            </div>
          )}

          {/* Carousel Rows */}
          <div className="px-2 -mt-32 relative z-10 flex-grow pb-20">
            {top10.length > 0 && (
              <ContentRow title="Top 10 in Your House Today" videos={top10} onPlay={handlePlayVideo} onInfo={setInfoVideo} isTop10={true} />
            )}
            {continueWatching.length > 0 && (
              <ContentRow title="Continue Watching" videos={continueWatching} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}
            <ContentRow title="Home" videos={files} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            {shows.length > 0 && (
              <ContentRow title="TV Shows" videos={shows} onPlay={handlePlayVideo} onInfo={setInfoVideo} progresses={progresses} />
            )}
            {movies.length > 0 && (
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
                onClick={() => {
                  flushProgress();
                  setPlayingVideo(null);
                }}
                className="flex items-center gap-2 text-white hover:text-gray-300"
              >
                <ChevronLeft className="w-8 h-8" />
                <span className="text-xl font-bold">Back to Browse</span>
              </button>
            </div>
            
            <video 
              ref={videoRef}
              src={toLocalUri(playingVideo.path)}
              controls 
              autoPlay 
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleVideoLoaded}
              onPause={flushProgress}
              onEnded={flushProgress}
              className="w-full h-full outline-none"
            />

            {/* Skip Intro Button */}
            {videoRef.current && (playingVideo.duration || 0) < 3600 && videoRef.current.currentTime > 30 && videoRef.current.currentTime < 150 && (
              <button 
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime += 85;
                }}
                className="absolute bottom-24 right-10 bg-black/60 hover:bg-white text-white hover:text-black border border-white/40 px-6 py-2 rounded text-lg font-bold transition-all z-[302]"
              >
                Skip Intro ⏭️
              </button>
            )}

            {/* Next Episode Binge Overlay */}
            <AnimatePresence>
              {showNextOverlay && nextEpisode && (
                <motion.div 
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  className="absolute bottom-24 right-10 bg-[#181818]/90 p-4 rounded shadow-2xl border border-gray-600/50 flex flex-col gap-2 z-[302] w-72"
                >
                  <p className="text-gray-300 font-bold text-sm">Next episode in 15 seconds...</p>
                  <div className="text-white font-bold truncate">{nextEpisode.meta?.title || nextEpisode.name}</div>
                  <button 
                    onClick={() => {
                      setShowNextOverlay(false);
                      handlePlayVideo(nextEpisode);
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
