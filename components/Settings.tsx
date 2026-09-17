
import React, { useState } from 'react';
import { ArrowLeft, ChevronDown, ToggleRight, ToggleLeft, Check, Globe, Calendar, Clock, Thermometer, Maximize, Droplets, FlaskConical, Layout, Image, Bell, BellOff, ShieldAlert } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { motion, AnimatePresence } from 'motion/react';

interface SettingRowProps {
  label: string; 
  value: string; 
  id: string; 
  icon?: React.ReactNode;
  options: string[]; 
  onSelect: (val: string) => void;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, value, id, icon, options, onSelect, activeMenu, setActiveMenu }) => {
  const isOpen = activeMenu === id;

  return (
    <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 shadow-xl">
      <div 
        className="p-4 flex justify-between items-center hover:bg-white/5 transition-colors cursor-pointer"
        onClick={() => setActiveMenu(isOpen ? null : id)}
      >
        <div className="flex items-center gap-3">
          <div className="text-slate-500">{icon}</div>
          <span className="font-bold text-sm text-slate-300">{label}</span>
        </div>
        <div className="flex items-center font-black text-[11px] uppercase tracking-tighter text-brand-cyan bg-brand-cyan/10 px-2 py-1 rounded">
          {value} <ChevronDown size={14} className={`ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-2 pb-2 bg-slate-950/30"
          >
            <div className="grid grid-cols-1 gap-1">
              {options.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    onSelect(opt);
                    setActiveMenu(null);
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl text-xs font-bold transition-all ${
                    value === opt ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/30' : 'text-slate-500 hover:bg-white/5'
                  }`}
                >
                  {opt}
                  {value === opt && <Check size={14} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Settings: React.FC = () => {
  const { setActiveTab, settings, updateSettings, notificationPermission, requestNotificationPermission } = useAppContext();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const languages = ['English (US)', 'Spanish', 'French', 'German'];
  const dateFormats = ['Month/Day/Year', 'Day/Month/Year', 'Year-Month-Day'];
  const timeFormats = ['Twelve Hours (AM/PM)', 'Twenty-Four Hours'];
  const tempUnits = ['Fahrenheit', 'Celsius'] as const;
  const dimUnits = ['Feet', 'Inches'] as const;
  const humUnits = ['Relative Humidity', 'Grains / Pound', 'g/kg'] as const;
  const volUnits = ['Pint', 'Liter'] as const;
  const defaultViews = ['Timeline', 'List'] as const;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      <header className="bg-slate-900/80 backdrop-blur-xl border-b border-white/5 p-4 flex items-center sticky top-0 z-20">
        <button onClick={() => setActiveTab('dashboard')} className="mr-4 text-slate-400 hover:text-white transition-colors p-1">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-black text-white uppercase tracking-tighter">System Intelligence</h1>
      </header>

      <div className="flex-1 p-4 space-y-6 pb-24 overflow-y-auto">
        {/* Profile Card */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-br from-brand-cyan/20 to-transparent border border-brand-cyan/20 rounded-3xl mb-4">
          <div className="w-12 h-12 rounded-full bg-brand-cyan flex items-center justify-center text-slate-900 font-black text-xl">
            MA
          </div>
          <div>
            <h2 className="font-black text-white leading-none">Merrill Alex</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Senior Mitigation Lead</p>
          </div>
        </div>

        {/* Broadcast Signals Section */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-2 flex items-center gap-2">
            <Bell size={10} /> Broadcast Signals
          </h2>
          <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-3">
              <div className="text-slate-500">
                {notificationPermission === 'granted' ? <Bell size={18} className="text-brand-cyan" /> : notificationPermission === 'denied' ? <BellOff size={18} className="text-red-500" /> : <Bell size={18} />}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-slate-300">Desktop Notifications</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${notificationPermission === 'granted' ? 'text-green-500' : notificationPermission === 'denied' ? 'text-red-500' : 'text-slate-500'}`}>
                  {notificationPermission === 'granted' ? 'Active Sync' : notificationPermission === 'denied' ? 'Manual Block' : 'Awaiting Authorization'}
                </span>
              </div>
            </div>
            {notificationPermission !== 'granted' ? (
              <button 
                onClick={() => requestNotificationPermission()}
                className="px-3 py-1.5 bg-brand-cyan text-slate-900 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:bg-cyan-400 active:scale-95 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
              >
                Authorize
              </button>
            ) : (
              <div className="p-2 text-green-500/50">
                <Check size={20} />
              </div>
            )}
          </div>
          {notificationPermission === 'denied' && (
            <div className="mx-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <ShieldAlert size={14} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Notifications are blocked by your browser settings. Please click the <span className="text-white font-bold">Lock icon</span> in your address bar to reset permissions.
              </p>
            </div>
          )}
        </section>

        {/* Locale Section */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-2 flex items-center gap-2">
            <Globe size={10} /> Localization
          </h2>
          <SettingRow 
            label="Language" 
            value={settings.language} 
            id="lang" 
            icon={<Globe size={18} />}
            options={languages} 
            onSelect={(val) => updateSettings({ language: val })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
        </section>

        {/* Date/Time Section */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-2 flex items-center gap-2">
            <Calendar size={10} /> Chronometry
          </h2>
          <SettingRow 
            label="Date Format" 
            value={settings.dateFormat} 
            id="dateFormat" 
            icon={<Calendar size={18} />}
            options={dateFormats} 
            onSelect={(val) => updateSettings({ dateFormat: val })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <SettingRow 
            label="Time Display" 
            value={settings.timeFormat} 
            id="timeFormat" 
            icon={<Clock size={18} />}
            options={timeFormats} 
            onSelect={(val) => updateSettings({ timeFormat: val })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
        </section>

        {/* Measurement Units */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-2 flex items-center gap-2">
            <FlaskConical size={10} /> Metrics & Science
          </h2>
          <SettingRow 
            label="Temperature Scale" 
            value={settings.units.temperature} 
            id="temp" 
            icon={<Thermometer size={18} />}
            options={[...tempUnits]} 
            onSelect={(val) => updateSettings({ units: { ...settings.units, temperature: val as 'Fahrenheit' | 'Celsius' } })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <SettingRow 
            label="Room Geometry" 
            value={settings.units.dimension} 
            id="dim" 
            icon={<Maximize size={18} />}
            options={[...dimUnits]} 
            onSelect={(val) => updateSettings({ units: { ...settings.units, dimension: val as 'Feet' | 'Inches' } })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <SettingRow 
            label="Relative Humidity" 
            value={settings.units.humidity} 
            id="hum" 
            icon={<Droplets size={18} />}
            options={[...humUnits]} 
            onSelect={(val) => updateSettings({ units: { ...settings.units, humidity: val as 'Relative Humidity' | 'Grains / Pound' | 'g/kg' } })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          <SettingRow 
            label="Extraction Capacity" 
            value={settings.units.volume} 
            id="vol" 
            icon={<FlaskConical size={18} />}
            options={[...volUnits]} 
            onSelect={(val) => updateSettings({ units: { ...settings.units, volume: val as 'Pint' | 'Liter' } })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
        </section>

        {/* Preferences */}
        <section className="space-y-3">
          <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 ml-2 flex items-center gap-2">
            <Layout size={10} /> Experience
          </h2>
          <SettingRow 
            label="Default Sub-View" 
            value={settings.defaultView} 
            id="defaultView" 
            icon={<Layout size={18} />}
            options={[...defaultViews]} 
            onSelect={(val) => updateSettings({ defaultView: val as 'Timeline' | 'List' })} 
            activeMenu={activeMenu}
            setActiveMenu={setActiveMenu}
          />
          
          <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-3">
              <div className="text-slate-500"><Image size={18} /></div>
              <span className="font-bold text-sm text-slate-300">Device Gallery Auto-Save</span>
            </div>
            <button onClick={() => updateSettings({ copyPhotosToGallery: !settings.copyPhotosToGallery })} className="transition-all active:scale-95">
              {settings.copyPhotosToGallery ? 
                <ToggleRight size={36} className="text-brand-cyan" /> : 
                <ToggleLeft size={36} className="text-slate-700" />
              }
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="pt-4">
          <button className="w-full py-4 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-500 font-black text-xs uppercase tracking-[0.2em] hover:bg-red-500/10 transition-colors">
            Reset All configurations
          </button>
        </section>
      </div>
    </div>
  );
};

export default Settings;
