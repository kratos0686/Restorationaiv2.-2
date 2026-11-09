
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DesktopApp from './components/DesktopApp';
import MobileApp from './components/MobileApp';
import { useAppContext } from './context/AppContext';
import OAuthHandler from './components/OAuthHandler';
import LaunchScreen from './components/LaunchScreen';
import CommandCenter from './components/CommandCenter';
import EventToast from './components/EventToast';
import ClientPortal from './components/ClientPortal';

// Declare aistudio on window
declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const App: React.FC = () => {
  const { isAuthenticated, isOnline, isSearchOpen, setIsSearchOpen } = useAppContext();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);
  // Lock layout mode at initial app load so rotating a mobile phone to landscape never unmounts MobileApp into DesktopApp
  const [isMobileLayout] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const location = useLocation();

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        try {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          setHasApiKey(hasKey);
        } catch (e) {
          console.error("Error checking API key:", e);
          setHasApiKey(false);
        }
      } else {
        // If aistudio is not available, assume we have a key (e.g. local dev)
        setHasApiKey(true);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setIsSearchOpen(!isSearchOpen);
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, setIsSearchOpen]);

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      // Assume success to avoid race conditions as per guidelines
      setHasApiKey(true);
    }
  };

  // Check if we are trying to access the client portal directly
  const isPortalRoute = location.pathname.startsWith('/portal');

  if (isPortalRoute) {
    const projectId = location.pathname.split('/')[2];
    return <ClientPortal projectId={projectId} />;
  }

  if (hasApiKey === null || isAuthenticated === null) {
    return <LaunchScreen />;
  }

  if (!hasApiKey) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-brand-cyan/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-brand-cyan text-2xl font-black">AI</span>
          </div>
          <h2 className="text-2xl font-black mb-4">Vertex AI Configuration</h2>
          <p className="text-slate-400 text-sm mb-8 leading-relaxed">
            To use Vertex AI and advanced models, you must select an API key from a paid Google Cloud project.
            <br /><br />
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-brand-cyan hover:underline">
              View Billing Documentation
            </a>
          </p>
          <button 
            onClick={handleSelectKey}
            className="w-full py-4 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl font-black uppercase tracking-widest transition-all"
          >
            Select Google Cloud Project
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <OAuthHandler />;
  }

  return (
    <>
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {isMobileLayout ? <MobileApp /> : <DesktopApp />}
      <EventToast />
      <CommandCenter isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
      {!isOnline && (
          <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-[10px] font-black text-center py-1 z-[9999] tracking-widest uppercase shadow-lg">
              Field Protocol: Offline Mode Active • Data Saved Locally
          </div>
      )}
    </>
  );
};

export default App;
