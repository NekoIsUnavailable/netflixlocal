export async function generateVideoThumbnail(videoPath: string, skipThumbnail: boolean = false): Promise<{ thumbnail: string | null, duration: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.style.display = 'none';
    
    video.src = `local://${encodeURIComponent(videoPath)}`;
    video.crossOrigin = 'anonymous';

    let duration = 0;

    // When the metadata is loaded, seek to 10% of the video or 5 seconds
    video.onloadedmetadata = () => {
      if (video.duration) {
        duration = video.duration;
        if (skipThumbnail) {
          resolve({ thumbnail: null, duration });
          return;
        }
        video.currentTime = Math.min(5, video.duration * 0.1);
      } else {
        if (skipThumbnail) {
          resolve({ thumbnail: null, duration: 0 });
          return;
        }
        video.currentTime = 0;
      }
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve({ thumbnail: dataUrl, duration });
        } else {
          resolve({ thumbnail: null, duration });
        }
      } catch (error) {
        console.error('Canvas error:', error);
        resolve({ thumbnail: null, duration });
      }
    };

    video.onerror = () => {
      console.error('Failed to load video for thumbnail:', videoPath);
      resolve({ thumbnail: null, duration: 0 });
    };
  });
}
