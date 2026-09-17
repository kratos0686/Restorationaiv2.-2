import React, { useState } from 'react';
import { Calculator, Thermometer, Droplets, Gauge, Wind, Zap } from 'lucide-react';
import { calculatePsychrometricsFromDryBulb } from '../utils/psychrometrics';
import { PsychrometricsData } from '../types';
import { useAppContext } from '../context/AppContext';

const PsychrometricCalculator: React.FC = () => {
  const { settings } = useAppContext();
  const [dryBulb, setDryBulb] = useState<string>('75');
  const [rh, setRh] = useState<string>('50');
  const [pressure, setPressure] = useState<string>('29.92');

  const tempUnit = settings.units.temperature === 'Fahrenheit' ? '°F' : '°C';
  const humUnit = settings.units.humidity === 'Grains / Pound' ? 'GPP' : 'g/kg';

  const results: PsychrometricsData | null = React.useMemo(() => {
    let t = parseFloat(dryBulb);
    const r = parseFloat(rh);
    const p = parseFloat(pressure);

    if (!isNaN(t) && !isNaN(r) && !isNaN(p)) {
      // Handle Celsius to Fahrenheit conversion for calculation
      if (settings.units.temperature === 'Celsius') {
        t = (t * 9 / 5) + 32;
      }

      // Convert pressure from inHg to mb for calculation
      const pressureMb = p * 33.8639;
      const calc = calculatePsychrometricsFromDryBulb(t, r, pressureMb);
      
      return {
        dryBulb: t,
        relativeHumidity: r,
        pressure: p,
        dewPoint: calc.dewPoint,
        gpp: calc.gpp,
        vaporPressure: calc.vaporPressure,
        enthalpy: calc.enthalpy
      };
    } else {
      return null;
    }
  }, [dryBulb, rh, pressure, settings.units.temperature]);

  return (
    <div className="bg-slate-900 rounded-[2rem] border border-white/5 p-8 animate-in fade-in h-max">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
          <Calculator className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-black text-white tracking-tight">Psychrometric Calculator</h2>
          <p className="text-xs text-slate-400">Calculate advanced dampness metrics from standard environment readings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Inputs */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-2">
            <Thermometer className="w-3 h-3" />
            Dry Bulb Temp ({tempUnit})
          </label>
          <input
             type="number"
             value={dryBulb}
             onChange={(e) => setDryBulb(e.target.value)}
             className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-base focus:outline-none focus:border-brand-cyan transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-2">
            <Droplets className="w-3 h-3" />
            Relative Humidity (%)
          </label>
          <input
            type="number"
            value={rh}
            onChange={(e) => setRh(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-base focus:outline-none focus:border-brand-cyan transition-colors"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold tracking-widest uppercase text-slate-500 flex items-center gap-2">
            <Gauge className="w-3 h-3" />
            Pressure (inHg)
          </label>
          <input
            type="number"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            step="0.01"
            className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-white text-base focus:outline-none focus:border-brand-cyan transition-colors"
          />
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ResultCard 
            label="Humidity Ratio" 
            value={settings.units.humidity === 'Grains / Pound' ? results.gpp : results.gpp / 7.0} 
            unit={humUnit} 
            icon={Wind} 
            color="text-brand-cyan" 
            bg="bg-brand-cyan/10 border border-brand-cyan/20" 
          />
          <ResultCard 
            label="Dew Point" 
            value={settings.units.temperature === 'Fahrenheit' ? results.dewPoint : (results.dewPoint - 32) * 5/9} 
            unit={tempUnit} 
            icon={Thermometer} 
            color="text-amber-500" 
            bg="bg-amber-500/10 border border-amber-500/20" 
          />
          <ResultCard label="Vapor Pressure" value={results.vaporPressure} unit="inHg" icon={Droplets} color="text-indigo-400" bg="bg-indigo-500/10 border border-indigo-500/20" />
          <ResultCard label="Enthalpy" value={results.enthalpy || 0} unit="BTU/lb" icon={Zap} color="text-pink-500" bg="bg-pink-500/10 border border-pink-500/20" />
        </div>
      )}
    </div>
  );
};

interface ResultCardProps {
  label: string;
  value: number;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

const ResultCard: React.FC<ResultCardProps> = ({ label, value, unit, icon: Icon, color, bg }) => (
  <div className={`p-4 rounded-2xl ${bg} flex flex-col justify-between h-32`}>
    <div className="flex items-center gap-2 text-slate-300">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</span>
    </div>
    <div className="mt-2">
      <div className={`text-3xl font-black ${color}`}>
        {typeof value === 'number' ? value.toFixed(1) : value}
      </div>
      <div className="text-xs font-medium text-slate-400 mt-1">{unit}</div>
    </div>
  </div>
);

export default PsychrometricCalculator;
