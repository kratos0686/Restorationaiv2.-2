import React, { useState, useMemo } from 'react';
import { Project } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Droplets, Target, CheckCircle2, AlertCircle, Info, Sparkles, ShieldCheck } from 'lucide-react';

interface MoistureTrendWidgetProps {
  project: Project;
}

export const MoistureTrendWidget: React.FC<MoistureTrendWidgetProps> = ({ project }) => {
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [showAverage, setShowAverage] = useState(true);

  const materials = useMemo(() => {
    return project.dryingMonitor || [];
  }, [project.dryingMonitor]);

  // Generate last 7 days as date objects
  const last7Days = useMemo(() => {
    const dates: Date[] = [];
    const now = new Date();
    // Start from 6 days ago up to today
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d);
    }
    return dates;
  }, []);

  // Format Helper
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const isSameDay = (date1: Date, timestamp: number) => {
    const date2 = new Date(timestamp);
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  // Process the chart data
  const chartData = useMemo(() => {
    if (materials.length === 0) return [];

    return last7Days.map(date => {
      const dateLabel = formatDate(date);
      const row: Record<string, string | number> = { date: dateLabel };
      
      let sum = 0;
      let count = 0;

      materials.forEach(mat => {
        // Find if there is an explicit reading on this day
        const dayReading = mat.readings?.find(r => isSameDay(date, r.timestamp));
        
        let val: number | undefined = undefined;
        
        if (dayReading) {
          val = dayReading.value;
        } else {
          // Carry-forward: find the most recent reading *before* this day
          const precedingReadings = (mat.readings || [])
            .filter(r => r.timestamp < date.getTime() + 864 * 100000) // include today's window
            .sort((a, b) => b.timestamp - a.timestamp);
          
          if (precedingReadings.length > 0) {
            val = precedingReadings[0].value;
          } else {
            // fallback to initial reading
            val = mat.initialReading;
          }
        }

        if (val !== undefined) {
          row[mat.id] = parseFloat(val.toFixed(1));
          sum += val;
          count++;
        }
      });

      if (count > 0) {
        row.average = parseFloat((sum / count).toFixed(1));
      }

      return row;
    });
  }, [materials, last7Days]);

  // Set default selection to all materials if they change
  React.useEffect(() => {
    if (materials.length > 0 && selectedMaterialIds.length === 0) {
      setSelectedMaterialIds(materials.map(m => m.id));
    }
  }, [materials, selectedMaterialIds.length]);

  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  // Helper colors for materials
  const materialColors = [
    '#06b6d4', // cyan-500
    '#3b82f6', // blue-500
    '#a855f7', // purple-500
    '#ec4899', // pink-500
    '#f59e0b', // amber-500
    '#10b981', // emerald-500
  ];

  // Dynamic calculations for the info ribbon
  const dryPercent = useMemo(() => {
    if (materials.length === 0) return 0;
    const dryCount = materials.filter(m => {
      const lastReading = m.readings?.length > 0 
        ? m.readings[m.readings.length - 1].value 
        : m.initialReading;
      return lastReading <= m.dryGoal;
    }).length;
    return Math.round((dryCount / materials.length) * 100);
  }, [materials]);

  const averageReduction = useMemo(() => {
    if (materials.length === 0) return 0;
    let totalInitial = 0;
    let totalCurrent = 0;
    
    materials.forEach(m => {
      totalInitial += m.initialReading;
      const lastReading = m.readings?.length > 0 
        ? m.readings[m.readings.length - 1].value 
        : m.initialReading;
      totalCurrent += lastReading;
    });

    const diff = totalInitial - totalCurrent;
    return Math.max(0, Math.round(diff));
  }, [materials]);

  if (materials.length === 0) {
    return (
      <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-white/5 mx-auto flex items-center justify-center text-slate-500">
          <Droplets className="text-slate-400" size={24} />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">Moisture Trends Unavailable</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Attach moisture records or log a daily dry log to visualize the structural drying trajectory of this project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-[2rem] p-6 space-y-6">
      
      {/* Header Container */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1 px-2.5 bg-brand-cyan/10 text-brand-cyan rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={10} /> 7-Day Drying Curve
            </span>
            <span className="text-[10px] text-slate-500 font-medium">IICRC S500 Standards</span>
          </div>
          <h3 className="text-base font-black text-white tracking-tight">Moisture Content Trends</h3>
          <p className="text-xs text-slate-400">Monitoring wood, drywall, and structural substrates over time.</p>
        </div>

        {/* Legend Custom Switch */}
        <div className="flex items-center space-x-3 bg-white/5 p-1 rounded-xl border border-white/10 self-start sm:self-auto">
          <button 
            onClick={() => setShowAverage(!showAverage)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${showAverage ? 'bg-brand-cyan text-slate-900' : 'text-slate-400 hover:text-white'}`}
          >
            <Target size={12} />
            <span>Show Overall Average</span>
          </button>
        </div>
      </div>

      {/* IICRC S500 Compliance Standard Banner */}
      <div className="bg-emerald-400/5 border border-emerald-500/20 rounded-2xl p-4 flex items-start space-x-3">
        <ShieldCheck className="text-emerald-400 shrink-0 mt-0.5" size={18} />
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">IICRC S500 Compliance standard</span>
            <span className="text-[9px] bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">12% MC Safe Target</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            The standard safe dry target is defined as <strong className="text-white font-bold">12% moisture content (MC%)</strong> (representing a default within 10% of unaffected materials). Substrates entering the shaded green success zone are certified as dried.
          </p>
        </div>
      </div>

      {/* KPI stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/60 p-3 rounded-2xl border border-white/5">
          <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Dry Progress</div>
          <div className="text-base font-black text-brand-cyan mt-0.5">{dryPercent}% <span className="text-[10px] text-slate-400 font-medium">Dry</span></div>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-2xl border border-white/5">
          <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Avg Reduction</div>
          <div className="text-base font-black text-sky-400 mt-0.5">-{averageReduction} <span className="text-[10px] text-slate-400 font-medium">pts/mc</span></div>
        </div>
        <div className="bg-slate-900/60 p-3 rounded-2xl border border-white/5">
          <div className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Active Substrates</div>
          <div className="text-base font-black text-purple-400 mt-0.5">{materials.length} <span className="text-[10px] text-slate-400 font-medium">monitored</span></div>
        </div>
      </div>

      {/* Chart Wrapper */}
      <div className="h-64 w-full">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="99%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false} 
              dy={10}
            />
            <YAxis 
              stroke="#94a3b8" 
              fontSize={10} 
              tickLine={false} 
              axisLine={false}
              domain={[0, 'auto']}
              unit="%"
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                borderColor: '#1e293b', 
                borderRadius: '16px',
                fontSize: '11px',
                color: '#fff',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
              }}
              labelStyle={{ fontWeight: 'black', color: '#38bdf8' }}
            />
            
            {/* Soft, clean translucent green zone representing IICRC S500 compliant dry status */}
            <ReferenceArea y1={0} y2={12} fill="#10b981" fillOpacity={0.06} />

            {/* Horizontal line representing standard safe target (12% MC) */}
            <ReferenceLine y={12} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'S500 Target (12%)', fill: '#10b981', fontSize: 9, position: 'insideRight', fontWeight: 'bold' }} />

            {/* Render selected material curve lines */}
            {materials.map((mat, i) => {
              const isSelected = selectedMaterialIds.includes(mat.id);
              if (!isSelected) return null;

              return (
                <Line
                  key={mat.id}
                  type="monotone"
                  dataKey={mat.id}
                  stroke={materialColors[i % materialColors.length]}
                  strokeWidth={2}
                  dot={{ r: 3, fill: materialColors[i % materialColors.length] }}
                  activeDot={{ r: 5 }}
                  name={mat.name}
                  connectNulls
                />
              );
            })}

            {/* Average drying trajectory line */}
            {showAverage && (
              <Line
                type="monotone"
                dataKey="average"
                stroke="#f43f5e"
                strokeWidth={3}
                strokeDasharray="4 4"
                dot={{ r: 4, fill: '#f43f5e' }}
                activeDot={{ r: 6 }}
                name="Overall Avg MC%"
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-white/5 rounded-xl border border-white/5">
            Not enough data to display chart
          </div>
        )}
      </div>

      {/* Checklist legend selector */}
      <div className="space-y-2">
        <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider flex items-center space-x-1">
          <Info size={10} />
          <span>Toggle materials to compare performance curves</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {materials.map((mat, i) => {
            const isSelected = selectedMaterialIds.includes(mat.id);
            const color = materialColors[i % materialColors.length];
            const lastReading = mat.readings?.length > 0
              ? mat.readings[mat.readings.length - 1].value
              : mat.initialReading;
            const isDry = lastReading <= mat.dryGoal;

            return (
              <button
                key={mat.id}
                onClick={() => toggleMaterial(mat.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 border transition-all ${
                  isSelected 
                    ? 'bg-slate-900 border-white/10 text-white' 
                    : 'bg-transparent border-white/5 text-slate-500 hover:text-slate-300'
                }`}
              >
                <span 
                  className="w-2.5 h-2.5 rounded-full block shrink-0" 
                  style={{ backgroundColor: isSelected ? color : '#475569' }}
                />
                <div className="text-left">
                  <div className="font-bold flex items-center space-x-1">
                    <span>{mat.name}</span>
                    {isDry ? (
                      <CheckCircle2 size={12} className="text-brand-cyan" />
                    ) : (
                      <AlertCircle size={12} className="text-amber-500" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">{mat.location} ({lastReading}%)</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};
