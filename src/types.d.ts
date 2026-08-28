export {};

declare global {
  interface Window {
    electronAPI: {
      scanDirectory: (dirPath: string) => Promise<{name: string, path: string}[]>;
      selectFolder: () => Promise<string | null>;
    }
  }
}
