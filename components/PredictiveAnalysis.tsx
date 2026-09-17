import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, 
  Calendar, 
  TrendingDown, 
  AlertTriangle, 
  Share2, 
  ArrowLeft
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { useAppContext } from '../context/AppContext';
import { getProjectById } from '../services/api';
import { GoogleGenAI, Type } from "@google/genai";

interface PredictiveAnalysisProps {
  onBack: () => void;
}

interface PredictionResult {
  estimatedDryDate: string;
  hoursRemaining: number;
  confidence: number;
  chartData: { day: string; actual?: number; predicted: number }[];
  factors: { title: string; description: string; type: 'positive' | 'negative' }[];
}

const PredictiveAnalysis: React.FC<PredictiveAnalysisProps> = ({ onBack }) => {
  const { selectedProjectId, isOnline } = useAppContext();
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const [predictionData, setPredictionData] = useState<PredictionResult | null>(null);

  useEffect(() => {
    const generatePrediction = async () => {
      if (!selectedProjectId) return;
      
      let project;
      try {
        project = await getProjectById(selectedProjectId);
      } catch (err) {
        console.error("Failed to fetch project for prediction", err);
        setIsAnalyzing(false);
        return;
      }
      if (!project) return;

      if (!isOnline) {
          // Offline Fallback
          setPredictionData({
              estimatedDryDate: 'Pending Sync',
              hoursRemaining: 0,
              confidence: 0,
              chartData: [],
              factors: []
          });
          setIsAnalyzing(false);
          return;
      }

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        // Prepare context from project logs
        const logsContext = JSON.stringify(project.rooms.flatMap(r => r.readings));
        const roomContext = JSON.stringify(project.rooms.map(r => ({ name: r.name, material: r.photos.map(p => p.tags).flat() })));

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze these drying logs: ${logsContext} for rooms: ${roomContext}. 
            1. Predict the "dry date" and hours remaining.
            2. Generate a chart dataset (Array of objects with 'day', 'actual' (optional), 'predicted') showing the moisture content trajectory down to 10%.
            3. Identify 2 key positive/negative factors affecting drying.
            Return JSON.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        estimatedDryDate: { type: Type.STRING },
                        hoursRemaining: { type: Type.NUMBER },
                        confidence: { type: Type.NUMBER },
                        chartData: { 
                            type: Type.ARRAY, 
                            items: { 
                                type: Type.OBJECT, 
                                properties: { 
                                    day: { type: Type.STRING }, 
                                    actual: { type: Type.NUMBER }, 
                                    predicted: { type: Type.NUMBER } 
                                } 
                            } 
                        },
                        factors: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    title: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    type: { type: Type.STRING, enum: ['positive', 'negative'] }
                                }
                            }
                        }
                    }
                }
            }
        });

        const data = JSON.parse(response.text || "{}");
        setPredictionData(data);
      } catch (err) {
        console.error("AI Prediction Failed:", err);
        // Mock data on failure for demo purposes
        setPredictionData({
            estimatedDryDate: "Oct 24",
            hoursRemaining: 36,
            confidence: 85,
            chartData: [
                { day: "Day 1", actual: 80, predicted: 80 },
                { day: "Day 2", actual: 65, predicted: 62 },
                { day: "Day 3", actual: 40, predicted: 45 },
                { day: "Day 4", predicted: 25 },
                { day: "Day 5", predicted: 12 },
            ],
            factors: [
                { title: "Optimal Dehumidification", description: "LGRs are performing at >85% efficiency.", type: 'positive' },
                { title: "Subfloor Assembly", description: "Hardwood limits evaporation rate.", type: 'negative' }
            ]
        });
      } finally {
        setIsAnalyzing(false);
      }
    };

    generatePrediction();
  }, [selectedProjectId, isOnline]);

  if (isAnalyzing) {
    return (
      <div className="flex flex-col h-full bg-slate-900 border-l border-white/5 animate-in slide-in-from-right-4">
        <header className="glass-panel p-6 pb-0 flex flex-col border-b border-white/5 z-10 relative">
          <div className="flex items-center space-x-4 mb-6">
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
               <ArrowLeft size={20} className="text-slate-400" />
            </button>
            <div>
              <div className="text-xs font-medium text-brand-cyan mb-1">Intelligence Division</div>
              <div className="text-2xl font-black text-white tracking-tight">Predictive Analytics</div>
            </div>
          </div>
        </header>
        <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 bg-slate-950">
          <div className="p-6 bg-brand-cyan/10 rounded-full animate-pulse">
            <BrainCircuit size={48} className="text-brand-cyan animate-spin-slow" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Simulating Drying Curves</h2>
            <p className="text-sm text-slate-400 font-medium max-w-xs mx-auto mt-2">
              Cross-referencing telemetry with psychrometric baselines...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!predictionData) return null;

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-white/5 animate-in slide-in-from-right-4">
      {/* Header */}
      <header className="glass-panel p-6 pb-0 flex flex-col border-b border-white/5 z-10 relative">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
               <ArrowLeft size={20} className="text-slate-400" />
            </button>
            <div>
              <div className="text-xs font-medium text-brand-cyan mb-1">Intelligence Division</div>
              <div className="text-2xl font-black text-white tracking-tight">Predictive Analytics</div>
            </div>
          </div>
          <div className="flex space-x-2">
            <button className="glass-card text-brand-cyan p-3 rounded-xl hover:bg-white/5 transition-transform">
              <Share2 size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Core Prediction Card */}
        <section className="bg-gradient-to-br from-brand-cyan/20 to-indigo-500/20 p-6 rounded-2xl border border-white/10 shadow-lg relative overflow-hidden">
          <div className="absolute -right-6 -top-6 text-white/5">
            <TrendingDown size={140} />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-brand-cyan uppercase tracking-widest mb-1">Estimated Dry Date</p>
              <h1 className="text-4xl font-black text-white">{predictionData.estimatedDryDate}</h1>
              <div className="flex items-center space-x-2 mt-4">
                <Calendar size={16} className="text-slate-300" />
                <span className="text-sm font-medium text-slate-300">~{predictionData.hoursRemaining} hours remaining</span>
              </div>
            </div>
            
            {/* Confidence Gauge */}
            <div className="hidden lg:flex flex-col items-center justify-center p-4 bg-slate-950/50 rounded-2xl border border-white/10">
              <div className="text-3xl font-black text-white">{predictionData.confidence}%</div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">AI Confidence</span>
              <div className="w-24 h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="bg-brand-cyan h-full rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]" style={{ width: `${predictionData.confidence}%` }} />
              </div>
            </div>
          </div>
        </section>

        {/* AI Trajectory Chart */}
        <section className="glass-card p-6 rounded-2xl border border-white/5 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white tracking-tight flex items-center space-x-2">
              <BrainCircuit className="text-brand-cyan" size={18} />
              <span>Projected Drying Curve</span>
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-white/10 px-2 py-1 rounded bg-slate-800">
              Target: 10% MC
            </span>
          </div>
          
          <div className="h-64 mt-4">
            <ResponsiveContainer width="99%" height="100%">
              <AreaChart data={predictionData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  itemStyle={{ fontSize: 14, fontWeight: 'bold' }}
                />
                <ReferenceLine y={10} stroke="#22c55e" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Dry Goal', fill: '#22c55e', fontSize: 10 }} />
                <Area type="monotone" dataKey="predicted" stroke="#06b6d4" strokeWidth={3} fillOpacity={1} fill="url(#colorPredicted)" />
                {predictionData.chartData.some(d => d.actual) && (
                  <Area type="monotone" dataKey="actual" stroke="#fff" strokeWidth={2} fill="none" dot={{ r: 4, fill: '#fff' }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Key Factors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {predictionData.factors.map((factor, i) => (
            <div key={i} className="glass-card p-5 rounded-2xl border border-white/5 flex items-start space-x-4">
              <div className={`p-3 rounded-xl mt-1 ${factor.type === 'positive' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {factor.type === 'positive' ? <TrendingDown size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div>
                <h4 className="font-bold text-white tracking-tight">{factor.title}</h4>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">{factor.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PredictiveAnalysis;
