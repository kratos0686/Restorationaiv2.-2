import React, { useMemo } from 'react';
import { Project } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity } from 'lucide-react';

interface Props {
  projects: Project[];
}

export const AggregateMoistureTrends: React.FC<Props> = ({ projects }) => {
  const chartData = useMemo(() => {
    const activeProjects = projects.filter(p => 
      p.status?.toLowerCase().includes('active') || p.status?.toLowerCase().includes('drying')
    );

    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    const isSameDay = (date1: Date, timestamp: number) => {
      const date2 = new Date(timestamp);
      return date1.getFullYear() === date2.getFullYear() &&
             date1.getMonth() === date2.getMonth() &&
             date1.getDate() === date2.getDate();
    };

    return last7Days.map(date => {
      let sum = 0;
      let count = 0;

      activeProjects.forEach(proj => {
        (proj.dryingMonitor || []).forEach(mat => {
          const dayReading = mat.readings?.find(r => isSameDay(date, r.timestamp));
          if (dayReading) {
            sum += dayReading.value;
            count++;
          } else {
            const preceding = (mat.readings || [])
              .filter(r => r.timestamp < date.getTime() + 86400000)
              .sort((a, b) => b.timestamp - a.timestamp);
            if (preceding.length > 0) {
              sum += preceding[0].value;
              count++;
            } else if (mat.initialReading !== undefined) {
              sum += mat.initialReading;
              count++;
            }
          }
        });
      });

      return {
        date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        avgMoisture: count > 0 ? parseFloat((sum / count).toFixed(1)) : 0
      };
    });
  }, [projects]);

  return (
    <div className="glass-card rounded-2xl p-6 border border-white/5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Activity size={18} className="text-brand-cyan" /> Global Moisture Trends
        </h3>
        <span className="text-xs text-slate-400">7-Day Avg Across Active Jobs</span>
      </div>
      <div className="h-64">
        {chartData.some(d => d.avgMoisture > 0) ? (
          <ResponsiveContainer width="99%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGlobalMoisture" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} unit="%" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.5rem', color: '#fff' }}
                itemStyle={{ color: '#0ea5e9', fontWeight: 'bold' }}
              />
              <Area 
                type="monotone" 
                dataKey="avgMoisture" 
                name="Global Avg MC%" 
                stroke="#0ea5e9" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorGlobalMoisture)" 
                activeDot={{ r: 6, fill: '#0ea5e9', stroke: '#fff', strokeWidth: 2 }} 
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs bg-white/5 rounded-xl border border-white/5">
            No active drying data available
          </div>
        )}
      </div>
    </div>
  );
};

export default AggregateMoistureTrends;
