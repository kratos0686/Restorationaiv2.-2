
import React, { useState } from 'react';
import { ArrowLeft, Wind, Droplets, Search, Globe, Loader2, WifiOff, ExternalLink } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { useAppContext } from '../context/AppContext';

interface ReferenceGuideProps {
  onBack: () => void;
}

const ReferenceGuide: React.FC<ReferenceGuideProps> = ({ onBack }) => {
  const { isOnline } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ text: string; links: { uri: string; title: string }[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !isOnline) return;
    setIsSearching(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Research this IICRC SR-500 topic: ${searchQuery}`,
        config: { tools: [{ googleSearch: {} }] }
      });
      setSearchResults({
        text: response.text,
        links: response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c: { web?: { uri: string; title: string } }) => c.web).filter((web): web is { uri: string; title: string } => !!web) || []
      });
    } catch (err) { console.error(err); } finally { setIsSearching(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-white/5 animate-in slide-in-from-right-4">
      {/* Header */}
      <div className="glass-panel p-6 pb-0 flex flex-col border-b border-white/5 z-10 relative">
        <div className="flex items-center space-x-4 mb-6">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
             <ArrowLeft size={20} className="text-slate-400" />
          </button>
          <div>
            <div className="text-xs font-medium text-brand-cyan mb-1">Intelligence Network</div>
            <div className="text-2xl font-black text-white tracking-tight">SR-500 Field Guide</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <section className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
          <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-widest text-brand-cyan"><Globe size={14} /><span>Industry Grounding</span></div>
          <div className="relative">
            <input 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSearch()} 
              placeholder={isOnline ? "Research IICRC standards, local news..." : "Offline - Search unavailable"} 
              disabled={!isOnline}
              className="w-full bg-slate-950 rounded-xl p-4 pr-12 text-sm text-white font-medium border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed placeholder:text-slate-500 focus:outline-none focus:border-brand-cyan transition-colors" 
            />
            <button 
              onClick={handleSearch} 
              disabled={!isOnline}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-cyan text-slate-900 rounded-lg shadow-lg disabled:bg-slate-700 disabled:text-slate-500 hover:bg-brand-cyan/90 transition-colors"
            >
              {isSearching ? <Loader2 size={18} className="animate-spin" /> : (isOnline ? <Search size={18} /> : <WifiOff size={18} />)}
            </button>
          </div>
          {searchResults && (
            <div className="animate-in slide-in-from-top mt-4 space-y-4">
              <div className="p-4 bg-slate-950 rounded-xl text-sm leading-relaxed text-slate-300 font-medium border border-white/5">{searchResults.text}</div>
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase text-slate-500 tracking-widest">Sources</span>
                {searchResults.links.map((l, i) => (
                  <a key={i} href={l.uri} target="_blank" rel="noreferrer" className="flex items-center justify-between bg-slate-800/50 border border-white/5 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                    <span className="text-xs font-bold text-brand-cyan truncate mr-4">{l.title}</span>
                    <ExternalLink size={12} className="text-slate-500 group-hover:text-brand-cyan transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        <GuideSection icon={<Wind />} title="Equipment Sizing" description="IICRC Standard Formulas" color="indigo">
          <div className="bg-slate-950 p-4 rounded-xl text-xs font-medium text-slate-300 border border-white/5">Air Mover Base: 1 per room, plus 1 per 50-70 sq.ft of wet flooring.</div>
        </GuideSection>
        
        <GuideSection icon={<Droplets />} title="Water Categories" description="S-500 Classification" color="cyan">
          <div className="bg-slate-950 p-4 rounded-xl text-xs font-medium text-slate-300 border border-white/5 space-y-3">
              <p className="flex items-start gap-2"><span className="text-emerald-400 font-bold min-w-[50px]">CAT 1:</span> Clean water source.</p>
              <p className="flex items-start gap-2"><span className="text-amber-400 font-bold min-w-[50px]">CAT 2:</span> Significant contamination (Gray).</p>
              <p className="flex items-start gap-2"><span className="text-red-400 font-bold min-w-[50px]">CAT 3:</span> Grossly unsanitary (Black).</p>
          </div>
        </GuideSection>
      </div>
    </div>
  );
};

const GuideSection = ({ icon, title, description, children, color }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode, color: 'indigo' | 'cyan' }) => {
  const iconBg = color === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-brand-cyan/10 text-brand-cyan';
  
  return (
    <section className="glass-card p-6 rounded-2xl border border-white/5 shadow-sm">
      <div className="flex items-start space-x-4 mb-4">
        <div className={`p-3 rounded-xl ${iconBg}`}>{icon}</div>
        <div>
          <h3 className="font-bold text-white tracking-tight">{title}</h3>
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
};

export default ReferenceGuide;
