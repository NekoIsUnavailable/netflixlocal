export {};

interface ScanResultFile {
  name: string;
  path: string;
  folderName?: string;
  localPoster?: string | null;
  localFanart?: string | null;
  localNfoContent?: string | null;
  size: number;
  mtimeMs: number;
}

interface ScanProgressEvent {
  scannedCount?: number;
  mediaCount?: number;
  done?: boolean;
  hitScanLimit?: boolean;
  error?: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      scanDirectory: (dirPath: string) => Promise<ScanResultFile[]>;
      selectFolder: () => Promise<string | null>;
      selectFile: () => Promise<string | null>;
      playInExternalPlayer: (playerPath: string, videoPath: string) => Promise<void>;
      onScanProgress: (callback: (payload: ScanProgressEvent) => void) => unknown;
      offScanProgress: (handler: unknown) => void;
    }
  }
}
