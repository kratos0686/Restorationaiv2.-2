
import React, { useState } from 'react';
import { ShieldCheck, Lock, Loader2, Key, CheckCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { User, UserRole } from '../types';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

const OAuthHandler: React.FC = () => {
  const { setAuthentication, setCurrentUser } = useAppContext();
  const [authStage, setAuthStage] = useState<'idle' | 'exchanging_token' | 'complete'>('idle');
  const [statusMessage, setStatusMessage] = useState('Initializing Secure Login...');

  const handleLogin = async () => {
    setAuthStage('exchanging_token');
    setStatusMessage("Authenticating with Google...");
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const user = result.user;
      
      const loggedInUser: User = {
        id: user.uid,
        name: user.displayName || 'User',
        email: user.email || '',
        role: 'SuperAdmin' as UserRole, // Granting SuperAdmin for preview
        permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin', 'use_ai_tools', 'manage_company'],
        companyId: 'company-1'
      };

      setCurrentUser(loggedInUser);
      setAuthStage('complete');
      setStatusMessage(`Welcome, ${loggedInUser.name}`);
      
      setTimeout(() => {
        setAuthentication(true);
      }, 1000);

    } catch (error) {
      console.error("Login failed:", error);
      setAuthStage('idle');
      setStatusMessage("Login failed. Please try again.");
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[100px] rounded-full" />

        <div className="z-10 w-full max-w-md bg-white/5 border border-white/10 rounded-[2rem] p-8 backdrop-blur-xl shadow-2xl">
            <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/20">
                    <Lock size={32} />
                </div>
                <h1 className="text-xl font-bold text-white tracking-tight">Restoration<span className="text-blue-500">AI</span></h1>
                <p className="text-slate-400 text-xs mt-1 font-mono">Secure Google Sign In</p>
            </div>

            <div className="space-y-6 relative">
                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-slate-800 -z-10" />

                <div className={`flex items-center space-x-4 transition-opacity duration-500 ${authStage === 'exchanging_token' || authStage === 'complete' ? 'opacity-100' : 'opacity-30'}`}>
                    <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center bg-slate-900 transition-colors duration-500 ${authStage === 'exchanging_token' ? 'border-indigo-500 text-indigo-500 animate-pulse' : (authStage === 'complete' ? 'border-green-500 text-green-500' : 'border-slate-700 text-slate-700')}`}>
                         {authStage === 'exchanging_token' ? <Loader2 size={20} className="animate-spin" /> : (authStage === 'complete' ? <CheckCircle size={20} /> : <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5 opacity-50 grayscale" alt="Google" />)}
                    </div>
                    <div>
                        <h3 className={`text-sm font-bold ${authStage === 'exchanging_token' ? 'text-indigo-400' : 'text-white'}`}>Authenticating</h3>
                        <p className="text-[10px] text-slate-500">Connecting to Google</p>
                    </div>
                </div>

                 <div className={`flex items-center space-x-4 transition-opacity duration-500 ${authStage === 'complete' ? 'opacity-100' : 'opacity-30'}`}>
                    <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center bg-slate-900 transition-colors duration-500 ${authStage === 'complete' ? 'border-emerald-500 text-emerald-500' : 'border-slate-700 text-slate-700'}`}>
                        {authStage === 'complete' ? <ShieldCheck size={20} /> : <Key size={20} />}
                    </div>
                    <div>
                        <h3 className={`text-sm font-bold ${authStage === 'complete' ? 'text-emerald-400' : 'text-white'}`}>Session Granted</h3>
                        <p className="text-[10px] text-slate-500">Authenticated</p>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 text-center space-y-4">
                 <p className="text-xs font-mono text-blue-400 animate-pulse">{authStage !== 'idle' ? statusMessage : 'Ready for secure login'}</p>
                 
                 <div className="grid grid-cols-1 gap-2">
                   {authStage === 'idle' && (
                     <button 
                       onClick={handleLogin}
                       className="w-full h-14 bg-white text-slate-900 rounded-2xl font-bold text-sm flex items-center justify-center space-x-3 shadow-2xl hover:bg-slate-50 active:scale-[0.98] transition-all ring-1 ring-slate-200"
                     >
                       <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="Google" />
                       <span>Sign in with Google</span>
                     </button>
                   )}
                 </div>
            </div>
        </div>
        
        <div className="mt-8 flex items-center space-x-2 text-slate-600 text-[10px] font-bold uppercase tracking-widest">
            <Lock size={12} />
            <span>256-bit TLS Encryption</span>
        </div>
    </div>
  );
};

export default OAuthHandler;
