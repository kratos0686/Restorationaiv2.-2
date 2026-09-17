
import React from 'react';
import { BrainCircuit, ShieldCheck, Lock, ExternalLink } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import Branding from './Branding';

declare global {
  interface Window {
    aistudio?: {
      openSelectKey: () => Promise<void>;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

const AuthScreen: React.FC = () => {
  const { setAuthentication } = useAppContext();

  const handleGoogleSignIn = async () => {
    if (window.aistudio) {
      try {
        await window.aistudio.openSelectKey();
        setAuthentication(true);
      } catch (err) {
        console.error("Authentication Error", err);
        setAuthentication(false);
      }
    } else {
        // For local dev, bypass and authenticate
        setAuthentication(true);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-between p-8 max-w-md mx-auto relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />
      <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full" />
      
      <div className="relative z-10 w-full flex flex-col items-center text-center mt-8">
        <Branding size="xl" className="flex-col space-x-0 space-y-4 justify-center" />
      </div>

      <div className="relative z-10 w-full flex flex-col items-center">
          <div className="w-full bg-white/5 border border-white/10 rounded-[2.5rem] p-6 text-center backdrop-blur-md">
              <div className="flex justify-center mb-4"><div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 shadow-lg"><BrainCircuit size={24} className="text-indigo-300" /></div></div>
              <h2 className="text-lg font-bold text-white mb-2">Enable Enterprise AI Core</h2>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">To unlock predictive analysis and S500-compliant reporting, authorize RestorationAI to use Google's services via your secure cloud project.</p>
              <button onClick={handleGoogleSignIn} className="w-full bg-white text-slate-900 h-14 rounded-2xl font-bold text-sm flex items-center justify-center space-x-3 shadow-2xl hover:bg-slate-50 active:scale-[0.98] transition-all ring-1 ring-slate-200">
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="Google" />
                <span>Authorize with Google Cloud</span>
              </button>
              <p className="text-slate-500 text-[9px] text-center mt-4 font-bold uppercase tracking-widest">You will be prompted to select a paid project.</p>
              <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center justify-center text-blue-500 text-[10px] font-black uppercase tracking-widest hover:text-blue-400 transition-colors bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/20">Learn about Project &amp; Billing Setup <ExternalLink size={10} className="ml-2" /></a>
          </div>
      </div>

      <div className="grid grid-cols-2 gap-4 w-full">
          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-4 flex flex-col items-center backdrop-blur-md"><ShieldCheck className="text-emerald-500 mb-2" size={16} /><span className="text-white text-[8px] font-black uppercase tracking-tighter">IICRC S500</span></div>
          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-4 flex flex-col items-center backdrop-blur-md"><Lock className="text-blue-500 mb-2" size={16} /><span className="text-white text-[8px] font-black uppercase tracking-tighter">SOC 2 Type II</span></div>
      </div>
    </div>
  );
};

export default AuthScreen;
