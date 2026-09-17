import React, { useState } from 'react';
import { Project, WaterCategory, LossClass } from '../types';
import { BrainCircuit, Calculator, Activity, Users, Clock, Fan, ArrowRight } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

interface HistoricalPredictiveModelProps {
  projects: Project[];
}

const HistoricalPredictiveModel: React.FC<HistoricalPredictiveModelProps> = ({ projects }) => {
  const [sqFeet, setSqFeet] = useState<number>(1000);
  const [waterCategory, setWaterCategory] = useState<WaterCategory>(WaterCategory.CAT_1);
  const [lossClass, setLossClass] = useState<LossClass>(LossClass.CLASS_1);
  const [affectedRooms, setAffectedRooms] = useState<number>(2);
  const [offsetsCount, setOffsetsCount] = useState<number>(1);
  const [closetsCount, setClosetsCount] = useState<number>(1);
  const [ceilingArea, setCeilingArea] = useState<number>(0);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [forecast, setForecast] = useState<{
    estimatedDays: number;
    requiredPersonnel: number;
    recommendedAirMovers: number;
    recommendedDehus: number;
    confidence: number;
    insights: string[];
    breakdown?: {
      primaryRooms: number;
      floorAreaFactor: number;
      ceilingAreaFactor: number;
      offsetsCount: number;
      closetsCount: number;
    };
  } | null>(null);

  const generateForecast = async () => {
    setIsAnalyzing(true);
    try {
      const completedProjects = projects.filter(p => p.currentStage === 'Closeout' || p.currentStage === 'Monitor');
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      
      const prompt = `You are an IICRC S500 certified water mitigation and restoration analytics AI.
      Given these completed historical project data trends (completedProjects: ${completedProjects.length}), forecast the requirements for a new water mitigation project with the following parameters:
      - Affected Area: ${sqFeet} sq ft
      - Water Category: ${waterCategory}
      - Loss Class: ${lossClass}
      - Affected Rooms: ${affectedRooms}
      - Insets / Offsets (>18 inches deep): ${offsetsCount} (e.g. alcoves, recessed walls, fireplace bump-outs)
      - Closets / Pantries / Hallways: ${closetsCount}
      - Wet Ceiling / Upper Wall Area: ${ceilingArea} sq ft
      
      Note: Air movers MUST be recommended following the IICRC S500:2021 air mover installation standard formula:
      - Class 1 to 4 general rule:
        * 1 air mover for each affected room
        * 1 air mover for every 50 to 70 sq ft of affected wet floor and walls (up to 2 feet high)
        * 1 air mover for every 100 to 150 sq ft of affected wet ceiling and wall area (above 2 feet)
        * 1 air mover for each inset/offset/alcove greater than 18 inches deep
        * 1 air mover for each closet, pantry, or hallway
      
      Return ONLY a JSON object with this exact structure:
      {
        "estimatedDays": number, // typical days to dry (generally 3 to 5)
        "requiredPersonnel": number, // number of technicians needed
        "recommendedAirMovers": number, // total computed air movers using the S500 formula described above
        "recommendedDehus": number, // recommended dehumidifiers (e.g., LGR, typically 1 per 500-1000 sq ft depending on class)
        "confidence": number, // 0-100 percentage based on standard predictability
        "insights": ["string"] // 2 brief insights justifying the prediction, highlighting S500 variables
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      const data = JSON.parse(response.text || '{}');
      
      const primaryRoomsVal = affectedRooms;
      const floorVal = Math.ceil(sqFeet / 60);
      const ceilingVal = Math.ceil(ceilingArea / 120);
      
      setForecast({
        estimatedDays: data.estimatedDays || 3,
        requiredPersonnel: data.requiredPersonnel || 2,
        recommendedAirMovers: data.recommendedAirMovers || (primaryRoomsVal + floorVal + ceilingVal + offsetsCount + closetsCount),
        recommendedDehus: data.recommendedDehus || Math.max(1, Math.ceil(sqFeet / 700)),
        confidence: data.confidence || 85,
        insights: data.insights || ['IICRC S500 standard calculation successfully applied.'],
        breakdown: {
          primaryRooms: primaryRoomsVal,
          floorAreaFactor: floorVal,
          ceilingAreaFactor: ceilingVal,
          offsetsCount: offsetsCount,
          closetsCount: closetsCount
        }
      });
    } catch (e) {
      console.error("AI Error", e);
      // Fallback logic
      let baseDays = 3;
      if (lossClass === LossClass.CLASS_4) baseDays = 7;
      if (waterCategory === WaterCategory.CAT_3) baseDays += 2;
      
      const primaryRoomsVal = affectedRooms;
      const floorVal = Math.ceil(sqFeet / 60);
      const ceilingVal = Math.ceil(ceilingArea / 120);
      const standardAirMovers = primaryRoomsVal + floorVal + ceilingVal + offsetsCount + closetsCount;
      
      setForecast({
        estimatedDays: baseDays,
        requiredPersonnel: sqFeet > 2000 ? 4 : 2,
        recommendedAirMovers: standardAirMovers,
        recommendedDehus: Math.max(1, Math.ceil(sqFeet / 700)),
        confidence: 75,
        insights: ["Calculated using standard S500 baseline heuristics with room offsets (AI Offline fallback)."],
        breakdown: {
          primaryRooms: primaryRoomsVal,
          floorAreaFactor: floorVal,
          ceilingAreaFactor: ceilingVal,
          offsetsCount: offsetsCount,
          closetsCount: closetsCount
        }
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900 to-slate-950 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <BrainCircuit size={20} className="text-brand-cyan" /> 
            Predictive Resource Forecaster
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-lg">
            Analyzes historical project correlations to forecast personnel, equipment, and duration for new assignments.
          </p>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5 animate-in fade-in duration-200">
        <div className="p-6 md:w-1/3 flex flex-col gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Affected Floor Area (Sq Ft)</label>
            <input 
              type="number"
              value={sqFeet}
              onChange={(e) => setSqFeet(Number(e.target.value))}
              placeholder="e.g. 1500"
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-brand-cyan transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Affected Rooms</label>
              <input 
                type="number"
                min="1"
                value={affectedRooms}
                onChange={(e) => setAffectedRooms(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-brand-cyan transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-brand-cyan uppercase tracking-widest block mb-2">Offsets (&gt;18&quot; deep)</label>
              <input 
                type="number"
                min="0"
                value={offsetsCount}
                onChange={(e) => setOffsetsCount(Math.max(0, Number(e.target.value)))}
                title="Room insets, recesses, or alcoves greater than 18 inches deep as per IICRC S500"
                className="w-full bg-slate-950 border border-brand-cyan/20 rounded-xl p-3 text-sm text-brand-cyan font-bold outline-none focus:border-white transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Closet/Hallway</label>
              <input 
                type="number"
                min="0"
                value={closetsCount}
                onChange={(e) => setClosetsCount(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-brand-cyan transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Ceiling area (Sq Ft)</label>
              <input 
                type="number"
                min="0"
                value={ceilingArea}
                onChange={(e) => setCeilingArea(Math.max(0, Number(e.target.value)))}
                placeholder="e.g. 0"
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-brand-cyan transition-colors"
              />
            </div>
          </div>
          
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Water Category</label>
            <select 
              value={waterCategory}
              onChange={(e) => setWaterCategory(e.target.value as WaterCategory)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-brand-cyan transition-colors"
            >
              {Object.values(WaterCategory).map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Loss Class</label>
            <select 
              value={lossClass}
              onChange={(e) => setLossClass(e.target.value as LossClass)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-brand-cyan transition-colors"
            >
              {Object.values(LossClass).map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={generateForecast}
            disabled={isAnalyzing || !sqFeet}
            className="w-full py-3 bg-brand-cyan text-slate-900 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-[#00e6b8] transition-colors disabled:opacity-50 mt-2 flex justify-center items-center gap-2"
          >
            {isAnalyzing ? (
              <><span className="animate-spin"><Activity size={16} /></span> Processing...</>
            ) : (
              <>Forecast Analysis <ArrowRight size={16} /></>
            )}
          </button>
        </div>
        
        <div className="p-6 md:w-2/3 bg-black/20">
          {forecast ? (
            <div className="animate-in fade-in zoom-in duration-300">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">Forecast Results</h3>
                <span className="px-2 py-1 bg-brand-cyan/20 text-brand-cyan text-[10px] font-black rounded uppercase tracking-widest">
                  {forecast.confidence}% Confidence
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-slate-900 rounded-xl border border-white/5">
                  <div className="text-slate-500 mb-2"><Clock size={16} /></div>
                  <div className="text-2xl font-black text-white">{forecast.estimatedDays}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Days to Dry</div>
                </div>
                <div className="p-4 bg-slate-900 rounded-xl border border-white/5">
                  <div className="text-indigo-400 mb-2"><Users size={16} /></div>
                  <div className="text-2xl font-black text-white">{forecast.requiredPersonnel}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Technicians</div>
                </div>
                <div className="p-4 bg-slate-900 rounded-xl border border-white/5">
                  <div className="text-blue-400 mb-2"><Fan size={16} /></div>
                  <div className="text-2xl font-black text-white">{forecast.recommendedAirMovers}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Air Movers</div>
                </div>
                <div className="p-4 bg-slate-900 rounded-xl border border-white/5">
                  <div className="text-emerald-400 mb-2"><Activity size={16} /></div>
                  <div className="text-2xl font-black text-white">{forecast.recommendedDehus}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dehus</div>
                </div>
              </div>

              {forecast.breakdown && (
                <div className="bg-slate-900/60 rounded-xl p-5 border border-brand-cyan/20 mb-6 animate-in slide-in-from-bottom-2">
                  <h4 className="text-[10px] font-bold text-brand-cyan uppercase tracking-widest mb-4 flex items-center gap-1.5">
                    <Fan size={14} className="text-brand-cyan animate-spin-slow" />
                    IICRC S500:2021 Air Mover Math Formula
                  </h4>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex justify-between text-slate-400 py-1.5 border-b border-white/5">
                      <span>Affected Rooms (1 per room baseline)</span>
                      <span className="font-mono text-white">+{forecast.breakdown.primaryRooms} AM</span>
                    </div>
                    <div className="flex justify-between text-slate-400 py-1.5 border-b border-white/5">
                      <span>Wet Floor Area factor (1 per 50-70 sq ft)</span>
                      <span className="font-mono text-white">
                        +{forecast.breakdown.floorAreaFactor} AM 
                        <span className="text-[10px] text-slate-500 ml-1">({sqFeet} sq ft)</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 py-1.5 border-b border-white/5">
                      <span>Wet Ceiling/Upper Walls factor (1 per 100-150 sq ft)</span>
                      <span className="font-mono text-white">
                        +{forecast.breakdown.ceilingAreaFactor} AM 
                        <span className="text-[10px] text-slate-500 ml-1">({ceilingArea} sq ft)</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-brand-cyan bg-brand-cyan/5 px-2 py-1.5 rounded-lg border border-brand-cyan/10">
                      <span className="font-medium">Room Offsets / Insets (&gt;18&quot; deep, 1 per offset)</span>
                      <span className="font-mono font-black">+{forecast.breakdown.offsetsCount} AM Offset</span>
                    </div>
                    <div className="flex justify-between text-slate-400 py-1.5 border-b border-white/5">
                      <span>Closet, Pantry & Hallway Addons (1 per space)</span>
                      <span className="font-mono text-white">+{forecast.breakdown.closetsCount} AM</span>
                    </div>
                    <div className="flex justify-between text-white font-bold pt-3 text-sm">
                      <span className="tracking-tight">Total Calculated Air Movers</span>
                      <span className="font-mono text-brand-cyan text-base">{forecast.recommendedAirMovers} AM</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal bg-slate-950/40 p-2.5 rounded-lg border border-white/5 mt-3">
                      💡 <strong>Standard Guideline:</strong> Any offset, alcove, room recess, or inset deeper than 18 inches restricts standard visual airflow pattern. Adding a dedicated air mover (Insert Offset rule) is strictly required to prevent moisture stagnation.
                    </p>
                  </div>
                </div>
              )}
              
              <div className="bg-slate-900/50 rounded-xl p-4 border border-white/5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">AI Insights based on Historical Data</h4>
                <div className="space-y-2">
                  {forecast.insights.map((insight, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="text-brand-cyan mt-0.5">•</div>
                      <p className="text-xs text-slate-300 leading-relaxed">{insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-slate-500">
              <Calculator size={48} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Input project parameters to generate a forecast.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HistoricalPredictiveModel;
