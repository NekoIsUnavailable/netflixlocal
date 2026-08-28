import { useState } from 'react';
import { X, Save, Image as ImageIcon, Palette, Type, Maximize } from 'lucide-react';

interface Settings {
  accentColor: string;
  wallpaperPath: string;
  overlayOpacity: number;
  appName: string;
  uiScale: number;
  useExternalPlayer: boolean;
  externalPlayerPath: string;
}

export function SettingsModal({ onClose, onSave, currentSettings }: { 
  onClose: () => void, 
  onSave: (settings: Settings) => void,
  currentSettings: Settings 
}) {
  const [settings, setSettings] = useState<Settings>(currentSettings);

  const handleSave = () => {
    onSave(settings);
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Electron adds the .path property to native File objects
      const file = e.target.files[0] as any;
      if (file.path) {
        setSettings({ ...settings, wallpaperPath: file.path });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-netflix-dark w-full max-w-md rounded-xl shadow-2xl border border-gray-800 p-6 relative max-h-[90vh] overflow-y-auto">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
          <Palette className="w-6 h-6 text-accent" />
          Appearance Settings
        </h2>

        <div className="space-y-6">
          {/* App Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
              <Type className="w-4 h-4" /> App Title
            </label>
            <input 
              type="text" 
              value={settings.appName}
              onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
              className="bg-black/50 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none w-full focus:border-accent"
              placeholder="e.g., JOHNFLIX"
            />
            <p className="text-xs text-gray-500 mt-1">Replaces the Netflix logo.</p>
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Accent Color</label>
            <div className="flex items-center gap-4">
              <input 
                type="color" 
                value={settings.accentColor}
                onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })}
                className="w-12 h-12 rounded cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="text-gray-400 text-sm font-mono">{settings.accentColor}</span>
            </div>
          </div>

          {/* Wallpaper */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Custom Wallpaper</label>
            <div className="flex items-center gap-2 bg-black/50 border border-gray-700 rounded px-3 py-2 relative hover:border-gray-500 transition cursor-pointer">
              <ImageIcon className="w-5 h-5 text-gray-400" />
              <input 
                type="file" 
                accept="image/*"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="text-sm text-gray-300 truncate w-full">
                {settings.wallpaperPath ? settings.wallpaperPath.split('\\').pop() : 'Click to browse...'}
              </span>
            </div>
            {settings.wallpaperPath && (
              <button 
                onClick={() => setSettings({ ...settings, wallpaperPath: '' })}
                className="text-xs text-red-500 mt-2 hover:underline"
              >
                Remove Wallpaper
              </button>
            )}
          </div>

          {/* Overlay Opacity */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Background Darkness: {Math.round(settings.overlayOpacity * 100)}%
            </label>
            <input 
              type="range" 
              min="0" max="1" step="0.1"
              value={settings.overlayOpacity}
              onChange={(e) => setSettings({ ...settings, overlayOpacity: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>

          {/* External Player */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
              🎬 External Player (Advanced)
            </h3>
            <div className="flex items-center gap-3 mb-4">
              <input 
                type="checkbox"
                id="useExternalPlayer"
                checked={settings.useExternalPlayer}
                onChange={(e) => setSettings({ ...settings, useExternalPlayer: e.target.checked })}
                className="w-5 h-5 accent-accent"
              />
              <label htmlFor="useExternalPlayer" className="text-sm font-semibold text-gray-300 cursor-pointer">
                Play videos in external player (PotPlayer, VLC)
              </label>
            </div>
            
            {settings.useExternalPlayer && (
              <div className="ml-8 space-y-2">
                <label className="block text-xs font-semibold text-gray-400">Path to Player Executable (.exe)</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={settings.externalPlayerPath}
                    onChange={(e) => setSettings({ ...settings, externalPlayerPath: e.target.value })}
                    className="bg-black/50 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none flex-grow focus:border-accent"
                    placeholder="C:\Program Files\DAUM\PotPlayer\PotPlayer64.exe"
                  />
                  <button 
                    onClick={async () => {
                      const path = await window.electronAPI.selectFile();
                      if (path) setSettings({ ...settings, externalPlayerPath: path });
                    }}
                    className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-white text-sm font-bold transition"
                  >
                    Browse
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* UI Scale */}
          <div className="border-t border-gray-700 pt-6">
            <label className="block text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
              <Maximize className="w-4 h-4" /> UI Scale: {Math.round(settings.uiScale * 100)}%
            </label>
            <input 
              type="range" 
              min="0.5" max="1.5" step="0.05"
              value={settings.uiScale}
              onChange={(e) => setSettings({ ...settings, uiScale: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 bg-accent text-white font-bold py-2 px-6 rounded hover:opacity-80 transition"
          >
            <Save className="w-5 h-5" />
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
}
