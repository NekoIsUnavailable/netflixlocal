import { useEffect, useState } from 'react';

export function StartupScreen({ onComplete, appName, accentColor }: { onComplete: () => void, appName: string, accentColor: string }) {
  const [stage, setStage] = useState<'hidden' | 'animating' | 'fading'>('hidden');

  useEffect(() => {
    // Stage 1: Play sound and start animation
    const audio = new Audio('/startup.mp3');
    audio.volume = 0.5;
    
    // We wrap this in a user interaction check or just try to play it. 
    // Browsers sometimes block autoplay, but in Electron it's usually allowed.
    audio.play().catch(() => console.log('Audio autoplay blocked'));
    
    setStage('animating');

    // Stage 2: Fade out after 3 seconds
    const fadeTimer = setTimeout(() => {
      setStage('fading');
    }, 3000);

    // Stage 3: Complete and unmount
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 3500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div 
      className={`fixed inset-0 z-[999] bg-black flex items-center justify-center transition-opacity duration-500 ${stage === 'fading' ? 'opacity-0' : 'opacity-100'}`}
    >
      <div 
        className={`text-6xl md:text-9xl font-black tracking-tighter transition-transform duration-[3000ms] ease-out`}
        style={{
          color: accentColor,
          transform: stage === 'animating' ? 'scale(1.2)' : 'scale(1)',
          textShadow: `0 0 40px ${accentColor}80, 0 0 100px ${accentColor}40`
        }}
      >
        {appName || 'NETFLIXLOCAL'}
      </div>
    </div>
  );
}
