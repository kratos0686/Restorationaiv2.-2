import React, { useMemo } from 'react';
import { Project } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Droplets, ShieldCheck, AlertCircle } from 'lucide-react';

interface ProjectHealthSummaryProps {
  project: Project;
}

export const ProjectHealthSummary: React.FC<ProjectHealthSummaryProps> = ({ project }) => {
  const chartData = useMemo(() => {
    const materials = project.dryingMonitor || [];
    const dataMap: Record<string, { date: string, avgMoisture: number, count: number }> = {};
    
    // Initial readings
    materials.forEach(mat => {
        if (!mat.readings || mat.readings.length === 0) return;
        
        if (!dataMap["Start"]) {
            dataMap["Start"] = { date: "Start", avgMoisture: 0, count: 0 };
        }
        dataMap["Start"].avgMoisture += mat.initialReading;
        dataMap["Start"].count += 1;
        
        // Add all readings
        mat.readings.forEach(reading => {
            if (!dataMap[reading.dateStr]) {
                dataMap[reading.dateStr] = { date: reading.dateStr, avgMoisture: 0, count: 0 };
            }
            dataMap[reading.dateStr].avgMoisture += reading.value;
            dataMap[reading.dateStr].count += 1;
        });
    });
    
    const data = Object.values(dataMap).map(d => ({
        date: d.date,
        avgMoisture: Math.round((d.avgMoisture / d.count) * 10) / 10
    }));
    
    // Sort logic could go here if dates were sortable, assuming they are added in order for now
    return data;
  }, [project.dryingMonitor]);

  const materials = project.dryingMonitor || [];
  const activeMaterials = materials.filter(m => {
      const lastReading = m.readings?.length > 0 ? m.readings[m.readings.length - 1].value : m.initialReading;
      return lastReading > m.dryGoal;
  }).length;

  const totalMaterials = materials.length;
  const isHealthy = activeMaterials === 0 || (chartData.length > 1 && chartData[chartData.length - 1].avgMoisture < chartData[0].avgMoisture);

  return (
    <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center">
          <Activity size={16} className="mr-2 text-brand-cyan" /> Project Health Summary
        </h3>
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${isHealthy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {isHealthy ? <ShieldCheck size={12} /> : <AlertCircle size={12} />}
          {isHealthy ? 'On Track' : 'Needs Attention'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-slate-950 p-3 rounded-xl border border-white/5">
           <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center"><Droplets size={12} className="mr-1" /> Active Drying</div>
           <div className="text-lg font-black text-white">{activeMaterials} <span className="text-xs text-slate-500 font-medium">/ {totalMaterials} materials</span></div>
        </div>
        <div className="bg-slate-950 p-3 rounded-xl border border-white/5">
           <div className="text-[10px] text-slate-500 font-bold uppercase mb-1 flex items-center"><Activity size={12} className="mr-1" /> Current Avg MC%</div>
           <div className="text-lg font-black text-brand-cyan">{chartData.length > 0 ? chartData[chartData.length - 1].avgMoisture : '--'}%</div>
        </div>
      </div>

      <div className="h-48 w-full mt-2">
        <ResponsiveContainer width="99%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <defs>
              <linearGradient id="colorMoisture" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} unit="%" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px', fontSize: '12px' }}
              itemStyle={{ color: '#0ea5e9', fontWeight: 'bold' }}
            />
            <ReferenceLine y={12} stroke="#10b981" strokeDasharray="4 4" label={{ value: 'Dry Standard (12%)', fill: '#10b981', fontSize: 10, position: 'insideBottomLeft' }} />
            <Area type="monotone" dataKey="avgMoisture" name="Avg MC%" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorMoisture)" activeDot={{ r: 6, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
