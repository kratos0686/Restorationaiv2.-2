
import React from 'react';
import Branding from './Branding';

const LaunchScreen: React.FC = () => {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 max-w-md mx-auto text-white">
      <div className="relative flex flex-col items-center justify-center animate-in fade-in duration-1000">
        <Branding className="scale-150 mb-8" />
      </div>
      <div className="absolute bottom-12 text-center">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-6">Initializing AI Core...</p>
      </div>
    </div>
  );
};

export default LaunchScreen;
