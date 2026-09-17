
import React, { useState } from 'react';
import { Square, CheckSquare, Download as DownloadIcon, Cloud, FileBox } from 'lucide-react';

const Downloads: React.FC = () => {
    const [items, setItems] = useState([
        { id: '1', label: 'Authorization to Repair', desc: "Standard repair authorization form", checked: false },
        { id: '2', label: 'AFICS - The Decision is Yours', desc: "AFICS specific authorization document", checked: false },
        { id: '3', label: 'ASI Worker Authorization', desc: "ASI field worker access & auth", checked: false },
        { id: '4', label: 'Cursive Work Authorization', desc: "Stylized/Cursive signature ready form", checked: false },
        { id: '5', label: 'Allstate COS (USA)', desc: "Certificate of Satisfaction for USA members", checked: false },
        { id: '6', label: 'Contractor Connect Form', desc: "Third-party vendor connection agreement", checked: false },
        { id: '7', label: '12-Hour Service Endorsement', desc: "Excellent service endorsement form", checked: false },
        { id: '8', label: 'Mitigation Insurance Forms', desc: "Carrier-specific mitigation documents", checked: false },
        { id: '9', label: 'Vendor Initial Call Template', desc: "Standardized intake for vendor calls", checked: false },
        { id: '10', label: 'Generic Work Authorization', desc: "Standard multi-purpose authorization", checked: false },
    ]);

    const toggle = (id: string) => {
        setItems(items.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
    };

    return (
        <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
            <header className="px-6 pt-12 pb-6 bg-gradient-to-br from-slate-900 to-slate-950 border-b border-white/5">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">Sync Center</h1>
                        <p className="text-xs text-brand-cyan font-bold uppercase tracking-widest mt-1">Offline Resources</p>
                    </div>
                    <Cloud size={32} className="text-slate-700" />
                </div>
            </header>

            <div className="flex-1 p-4 pb-24 overflow-y-auto space-y-4">
                <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden">
                    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-300">Available Updates</h2>
                        <button className="flex items-center space-x-2 bg-brand-cyan text-slate-900 rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider active:scale-95 transition-transform shadow-lg shadow-brand-cyan/20">
                            <DownloadIcon size={14} />
                            <span>Sync Selected</span>
                        </button>
                    </div>

                    <div className="divide-y divide-white/5">
                        {items.map((item) => (
                            <div key={item.id} onClick={() => toggle(item.id)} className="flex items-start p-4 cursor-pointer hover:bg-white/5 transition-colors group">
                                <div className={`mt-0.5 mr-4 transition-colors ${item.checked ? 'text-brand-cyan' : 'text-slate-600 group-hover:text-slate-500'}`}>
                                    {item.checked ? <CheckSquare size={20} /> : <Square size={20} />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                        <FileBox size={14} className="text-slate-500" />
                                        <h3 className={`font-bold text-sm ${item.checked ? 'text-white' : 'text-slate-300'}`}>{item.label}</h3>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1 leading-relaxed pl-6">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <div className="p-4 rounded-2xl bg-slate-800/50 border border-white/5 text-center">
                    <p className="text-[10px] text-slate-500 font-mono">Last Sync: Today, 8:42 AM</p>
                    <p className="text-[10px] text-slate-500 font-mono">Version: v2.4.0 (Stable)</p>
                </div>
            </div>
        </div>
    );
};

export default Downloads;
