
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Wind, Power, Clock, LayoutGrid, List, Calculator, ChevronRight, Plus, DollarSign, BrainCircuit, Loader2, ScanLine, Pencil } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { Project, PlacedEquipment, InventoryEquipment } from '../types';
import { EventBus } from '../services/EventBus';
import { getInventory, updateInventoryItem } from '../services/api';
import QRScanner from './QRScanner';

const EQUIPMENT_SPECS: Record<string, { amps: number, volts: number, cfm: number, type: string, dailyRate: number }> = {
  // LGR Dehumidifiers
  'Dri-Eaz LGR 7000XLi': { amps: 8.3, volts: 115, cfm: 325, type: 'Dehumidifier', dailyRate: 110 },
  'Dri-Eaz LGR 6000Li': { amps: 6.6, volts: 115, cfm: 320, type: 'Dehumidifier', dailyRate: 110 },
  'Dri-Eaz LGR 3500i': { amps: 10.5, volts: 115, cfm: 400, type: 'Dehumidifier', dailyRate: 110 },
  'Dri-Eaz LGR 2800i': { amps: 8.0, volts: 115, cfm: 400, type: 'Dehumidifier', dailyRate: 95 },
  'Dri-Eaz Revolution LGR': { amps: 6.2, volts: 115, cfm: 190, type: 'Dehumidifier', dailyRate: 95 },
  'Phoenix DryMAX XL': { amps: 7.7, volts: 115, cfm: 300, type: 'Dehumidifier', dailyRate: 110 },
  'Phoenix DryMAX (Compact)': { amps: 5.7, volts: 115, cfm: 170, type: 'Dehumidifier', dailyRate: 95 },
  'Phoenix 250 MAX': { amps: 8.2, volts: 115, cfm: 365, type: 'Dehumidifier', dailyRate: 110 },
  'Phoenix 200 MAX': { amps: 7.4, volts: 115, cfm: 315, type: 'Dehumidifier', dailyRate: 110 },
  'Phoenix R250': { amps: 8.3, volts: 115, cfm: 310, type: 'Dehumidifier', dailyRate: 110 },
  'Phoenix R200': { amps: 8.3, volts: 115, cfm: 325, type: 'Dehumidifier', dailyRate: 110 },
  'AlorAir Storm Elite': { amps: 8.1, volts: 115, cfm: 300, type: 'Dehumidifier', dailyRate: 110 },
  'AlorAir Storm LGR Extreme': { amps: 5.6, volts: 115, cfm: 210, type: 'Dehumidifier', dailyRate: 95 },
  'XPOWER XD-125': { amps: 7.3, volts: 115, cfm: 235, type: 'Dehumidifier', dailyRate: 110 },
  'XPOWER XD-85LH': { amps: 6.7, volts: 115, cfm: 180, type: 'Dehumidifier', dailyRate: 95 },
  'BlueDri BD-130-BL': { amps: 5.5, volts: 115, cfm: 235, type: 'Dehumidifier', dailyRate: 95 },

  // Desiccant Dehumidifiers
  'Dri-Eaz F413 Revolution Desiccant': { amps: 4.8, volts: 115, cfm: 115, type: 'Dehumidifier', dailyRate: 150 },
  'Phoenix Firebird Compact 20': { amps: 11.0, volts: 115, cfm: 130, type: 'Dehumidifier', dailyRate: 150 },
  'Phoenix 1200 Desiccant': { amps: 50.0, volts: 230, cfm: 1200, type: 'Dehumidifier', dailyRate: 300 },
  'AlorAir Zeus Extreme': { amps: 6.1, volts: 115, cfm: 200, type: 'Dehumidifier', dailyRate: 150 },

  // Low-Profile & Radial Air Movers
  'Dri-Eaz Velo': { amps: 1.9, volts: 115, cfm: 885, type: 'Air Mover', dailyRate: 35 },
  'Dri-Eaz Velo Pro': { amps: 1.9, volts: 115, cfm: 885, type: 'Air Mover', dailyRate: 35 },
  'Phoenix AirMAX Radial': { amps: 1.9, volts: 115, cfm: 925, type: 'Air Mover', dailyRate: 35 },
  'XPOWER PL-700A': { amps: 2.8, volts: 115, cfm: 1050, type: 'Air Mover', dailyRate: 35 },

  // Centrifugal Air Movers
  'Dri-Eaz Sahara Pro X3': { amps: 4.0, volts: 115, cfm: 2071, type: 'Air Mover', dailyRate: 35 },
  'Dri-Eaz Sahara E TurboDryer': { amps: 4.0, volts: 115, cfm: 1245, type: 'Air Mover', dailyRate: 35 },
  'Phoenix CAM Centrifugal': { amps: 2.8, volts: 115, cfm: 1050, type: 'Air Mover', dailyRate: 35 },
  'B-Air Vent VP-50': { amps: 4.5, volts: 115, cfm: 2820, type: 'Air Mover', dailyRate: 35 },
  'B-Air Vent VP-25 (Compact)': { amps: 2.1, volts: 115, cfm: 900, type: 'Air Mover', dailyRate: 35 },
  'XPOWER X-600A': { amps: 3.8, volts: 115, cfm: 2400, type: 'Air Mover', dailyRate: 35 },
  'BlueDri ONE-29': { amps: 5.0, volts: 115, cfm: 2900, type: 'Air Mover', dailyRate: 35 },

  // Axial Air Movers
  'Dri-Eaz Stealth AV3000': { amps: 2.7, volts: 115, cfm: 2600, type: 'Air Mover', dailyRate: 45 },
  'Dri-Eaz Vortex Axial Fan': { amps: 7.4, volts: 115, cfm: 2041, type: 'Air Mover', dailyRate: 45 },
  'Phoenix Focus Axial': { amps: 2.5, volts: 115, cfm: 3000, type: 'Air Mover', dailyRate: 45 },
  'XPOWER X-47ATR': { amps: 2.8, volts: 115, cfm: 3600, type: 'Air Mover', dailyRate: 45 },

  // Air Filtration Devices
  'Dri-Eaz HEPA 500 DefendAir': { amps: 3.0, volts: 115, cfm: 500, type: 'HEPA Scrubber', dailyRate: 85 },
  'Phoenix Guardian HEPA': { amps: 12.0, volts: 115, cfm: 1400, type: 'HEPA Scrubber', dailyRate: 150 },
  'Phoenix GuardianR HEPA': { amps: 2.4, volts: 115, cfm: 500, type: 'HEPA Scrubber', dailyRate: 85 },
  'AlorAir Clean Shield HEPA 550': { amps: 3.0, volts: 115, cfm: 550, type: 'HEPA Scrubber', dailyRate: 85 },
  'XPOWER X-3500': { amps: 2.8, volts: 115, cfm: 600, type: 'HEPA Scrubber', dailyRate: 85 },
  
  // Legacy mappings for existing mock data
  'Phoenix AirMax': { amps: 1.9, volts: 115, cfm: 925, type: 'Air Mover', dailyRate: 35 },
  'LGR 3500i': { amps: 10.5, volts: 115, cfm: 400, type: 'Dehumidifier', dailyRate: 110 },
  'DefendAir HEPA': { amps: 3.0, volts: 115, cfm: 500, type: 'HEPA Scrubber', dailyRate: 85 },
  'Velo Pro': { amps: 1.9, volts: 115, cfm: 885, type: 'Air Mover', dailyRate: 35 },
  'LGR 2800i': { amps: 8.0, volts: 115, cfm: 400, type: 'Dehumidifier', dailyRate: 95 },
};

const CIRCUIT_BREAKER_LIMIT_AMPS = 15;

const EquipmentManager: React.FC<{project: Project, onUpdate?: (updates: Partial<Project>) => void}> = ({ project, onUpdate }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, string>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isAiRecommendationsOpen, setIsAiRecommendationsOpen] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<string | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  
  const [filterType, setFilterType] = useState<string>('All');
  const [filterBrand, setFilterBrand] = useState<string>('All');
  
  const [addMenuFilterType, setAddMenuFilterType] = useState<string>('All');
  const [addMenuFilterBrand, setAddMenuFilterBrand] = useState<string>('All');
  
  const [editingHoursId, setEditingHoursId] = useState<string | null>(null);
  const [tempHours, setTempHours] = useState<string>('');

  const [globalInventory, setGlobalInventory] = useState<InventoryEquipment[]>([]);

  useEffect(() => {
    const fetchInv = async () => {
      const inv = await getInventory();
      setGlobalInventory(inv || []);
    };
    fetchInv();
  }, []);
  
  const equipment = useMemo(() => project.equipment || [], [project.equipment]);

  const uniqueTypes = useMemo(() => Array.from(new Set(equipment.filter(e => e.status !== 'Removed').map(e => e.type))), [equipment]);
  const uniqueBrands = useMemo(() => Array.from(new Set(equipment.filter(e => e.status !== 'Removed').map(e => e.model.split(' ')[0]))), [equipment]);

  const displayedEquipment = useMemo(() => {
    return equipment
      .filter(e => e.status !== 'Removed')
      .filter(e => filterType === 'All' || e.type === filterType)
      .filter(e => filterBrand === 'All' || e.model.startsWith(filterBrand));
  }, [equipment, filterType, filterBrand]);

  const stats = useMemo(() => {
    const rooms: Record<string, { equipment: typeof equipment, totalAmps: number }> = {};
    let dailyBurnRate = 0;
    
    equipment.filter(e => e.status === 'Running').forEach(item => {
        if (!rooms[item.room]) rooms[item.room] = { equipment: [], totalAmps: 0 };
        rooms[item.room].equipment.push(item);
        const specs = EQUIPMENT_SPECS[item.model];
        if (specs) {
            rooms[item.room].totalAmps += specs.amps;
            dailyBurnRate += specs.dailyRate;
        }
    });
    return { rooms, dailyBurnRate };
  }, [equipment]);

  useEffect(() => {
    if (isCalculatorOpen) {
      const getSuggestions = async () => {
        const suggestions: Record<string, string> = {};
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        
        for (const room in stats.rooms) {
          const data = stats.rooms[room];
          if (data.totalAmps > CIRCUIT_BREAKER_LIMIT_AMPS * 0.8) {
              // Publish Warning Event
              EventBus.publish(
                'com.restorationai.safety.warning',
                { room, load: data.totalAmps },
                project.id,
                `Circuit Warning: ${room} load at ${data.totalAmps.toFixed(1)}A.`,
                'warning'
              );
          }
          try {
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `Analyze load: ${data.totalAmps.toFixed(1)}A on 15A breaker. Equipment: ${JSON.stringify(data.equipment.map(e => e.model))}. Concise safety check.`
            });
            suggestions[room] = response.text || "Load Check Complete";
          } catch (err) { 
            console.error(err);
            suggestions[room] = "AI unavailable"; 
          }
        }
        setAiSuggestions(suggestions);
      };
      getSuggestions();
    }
  }, [isCalculatorOpen, stats, project.id]);

  const fetchAiRecommendations = async () => {
    if (aiRecommendations) return;
    setLoadingRecommendations(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        const context = {
            waterCategory: project.waterCategory,
            lossClass: project.lossClass,
            progress: project.progress,
            rooms: project.rooms.map(r => ({
                name: r.name,
                dimensions: r.dimensions,
                materials: r.materials,
                recentReadings: r.readings.slice(-3)
            })),
            dryingMonitor: project.dryingMonitor?.map(m => ({
                material: m.name,
                location: m.location,
                goal: m.dryGoal,
                latestReading: m.readings?.[m.readings.length - 1]?.value,
                status: m.status
            })),
            currentEquipment: equipment.map(e => ({ type: e.type, room: e.room, status: e.status }))
        };

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `As an IICRC-certified restoration expert, analyze this project context and provide very brief, actionable equipment deployment recommendations. Focus on optimizing equipment placement based on room moisture levels, material composition, and the current drying progress (${context.progress}%).
Project Context: ${JSON.stringify(context, null, 2)}
Output the advice formatting with clear bullet points. Keep it strictly related to equipment types (Air Movers, Dehus, Scrubbers) and their quantity/placement. Do not include introductory/outro fluff.`,
        });

        setAiRecommendations(response.text || "No recommendations generated.");
    } catch (err) {
        console.error("Failed to generate equipment recommendations:", err);
        setAiRecommendations("Failed to connect to AI for recommendations.");
    } finally {
        setLoadingRecommendations(false);
    }
  };

  const handleToggleRecommendations = () => {
      const willOpen = !isAiRecommendationsOpen;
      setIsAiRecommendationsOpen(willOpen);
      if (willOpen && !aiRecommendations) {
          fetchAiRecommendations();
      }
  };
  
  const handleToggleStatus = async (id: string) => {
    const updated = equipment.map(item =>
        item.id === id ? { ...item, status: item.status === 'Running' ? 'Off' : 'Running' } as PlacedEquipment : item
    );
    const item = updated.find(e => e.id === id);
    if (item) {
        // If this item is tied to an inventory ID (which we're storing as inventoryId? Wait, we can assume item.id is either inventoryId or local ID. If it's inventoryId, update status)
        // Wait, equipment status in PlacedEquipment is Running/Off, not inventory status. However when removing, we retrieve it.
        EventBus.publish(
            'com.restorationai.equipment.state.changed',
            { equipmentId: item.id, model: item.model, status: item.status },
            project.id,
            `${item.type} (${item.model}) switched ${item.status}.`,
            'info'
        );
    }
    if (onUpdate) onUpdate({ equipment: updated });
  };

  const handleUpdateHours = async (id: string, newHours: number) => {
    if (isNaN(newHours)) return;
    const updated = equipment.map(item =>
        item.id === id ? { ...item, hours: newHours } as PlacedEquipment : item
    );
    if (onUpdate) onUpdate({ equipment: updated });
    
    const item = equipment.find(e => e.id === id);
    if (item) {
        EventBus.publish(
            'com.restorationai.equipment.hours.updated',
            { equipmentId: item.id, model: item.model, oldHours: item.hours, newHours: newHours },
            project.id,
            `${item.model} reading updated to ${newHours}h.`,
            'info'
        );
    }
    setEditingHoursId(null);
  };

  const handleReturnEquipment = async (id: string) => {
    const item = equipment.find(e => e.id === id);
    if (!item) return;

    // Update global inventory if it's tracked
    if (item.id.startsWith('INV-')) {
        await updateInventoryItem(item.id, { status: 'available', currentProjectId: undefined });
    }

    const updated = equipment.map(e => e.id === id ? { ...e, status: 'Removed' } as PlacedEquipment : e);
    
    EventBus.publish(
        'com.restorationai.equipment.returned',
        { equipmentId: item.id, model: item.model },
        project.id,
        `${item.model} returned from ${item.room}.`,
        'success'
    );

    if (onUpdate) onUpdate({ equipment: updated });
  };

  const [draftEquipment, setDraftEquipment] = useState<{ id: string, model: string, room: string, status: 'Running' | 'Off' } | null>(null);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

  const handleQRScan = (data: string) => {
      try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object' && parsed.model) {
              // Found a valid equipment QR code
              setIsQRScannerOpen(false);
              handleSelectModel(parsed.id || `EQ-${Date.now()}`, parsed.model);
              EventBus.publish('com.restorationai.equipment.scanned', { model: parsed.model }, project.id, `Scanned equipment: ${parsed.model}`, 'success');
          } else {
              // Not equipment 
              EventBus.publish('com.restorationai.equipment.scanerror', {}, project.id, `Invalid equipment QR code format.`, 'error');
              setIsQRScannerOpen(false);
          }
      } catch {
          // If not valid JSON, we'll try to just read the raw string as model name
          if (data && data.length < 50) {
               setIsQRScannerOpen(false);
               handleSelectModel(`EQ-${Date.now()}`, data);
               EventBus.publish('com.restorationai.equipment.scanned', { model: data }, project.id, `Scanned equipment: ${data}`, 'success');
          } else {
               EventBus.publish('com.restorationai.equipment.scanerror', {}, project.id, `Invalid QR code read.`, 'error');
               setIsQRScannerOpen(false);
          }
      }
  };

  const handleSelectModel = useCallback((invId: string, model: string) => {
      setDraftEquipment({
          id: invId,
          model,
          room: project.rooms && project.rooms.length > 0 ? project.rooms[0].name : 'General',
          status: 'Running'
      });
      setShowAddMenu(false);
  }, [project.rooms]);

  const confirmAddEquipment = useCallback(async () => {
      if (!draftEquipment) return;
      
      const specs = EQUIPMENT_SPECS[draftEquipment.model] || { type: 'Unknown' };
      const newItem: PlacedEquipment = {
          id: draftEquipment.id,
          type: specs.type as PlacedEquipment['type'],
          model: draftEquipment.model,
          status: draftEquipment.status,
          hours: 0,
          room: draftEquipment.room
      };
      const updated = [...equipment, newItem];
      
      if (draftEquipment.id.startsWith('INV-')) {
          await updateInventoryItem(draftEquipment.id, { status: 'in_use', currentProjectId: project.id });
          setGlobalInventory(prev => prev.map(inv => inv.id === draftEquipment.id ? { ...inv, status: 'in_use', currentProjectId: project.id } : inv));
      }

      EventBus.publish(
          'com.restorationai.equipment.deployed',
          { equipmentId: newItem.id, model: newItem.model, room: newItem.room },
          project.id,
          `Deployed ${draftEquipment.model} to ${draftEquipment.room}.`,
          'success'
      );

      if (onUpdate) onUpdate({ equipment: updated });
      setDraftEquipment(null);
  }, [draftEquipment, equipment, project.id, onUpdate]);

  const cancelAddEquipment = () => setDraftEquipment(null);

  const theme = {
    bg: 'bg-slate-900 text-white',
    card: 'glass-card',
    text: 'text-white',
    subtext: 'text-brand-cyan',
  };

  return (
    <div className={`space-y-6 ${theme.bg}`}>
      <header className="flex justify-between items-end">
        <div><h2 className={`text-2xl font-black tracking-tight ${theme.text}`}>Equipment</h2><p className={`text-[10px] font-bold uppercase tracking-widest ${theme.subtext}`}>Runtime & Inventory Tracking</p></div>
        <div className={`flex p-1 rounded-xl bg-slate-800 border border-white/5`}>
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-slate-500 hover:text-white'}`}><LayoutGrid size={18} /></button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-slate-500 hover:text-white'}`}><List size={18} /></button>
        </div>
      </header>

      {/* Burn Rate Card */}
      <div className="bg-gradient-to-r from-emerald-900/40 to-slate-900 border border-emerald-500/20 rounded-[1.5rem] p-5 flex justify-between items-center">
          <div>
              <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Daily Burn Rate</p>
              <div className="flex items-baseline space-x-1">
                  <span className="text-3xl font-black text-white">${stats.dailyBurnRate}</span>
                  <span className="text-xs text-slate-400">/ day</span>
              </div>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400"><DollarSign size={24} /></div>
      </div>

      <div onClick={() => setIsCalculatorOpen(!isCalculatorOpen)} className={`${theme.card} p-5 rounded-[2rem] flex items-center justify-between cursor-pointer group active:scale-[0.98] transition-all hover:bg-white/5`}>
        <div className="flex items-center space-x-4"><div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400"><Calculator size={24} /></div><div><h3 className={`text-sm font-bold ${theme.text}`}>Load Calculator</h3><p className={`text-[10px] ${theme.subtext}`}>AI Circuit Analysis</p></div></div>
        <ChevronRight size={18} className="text-blue-300" />
      </div>

      {isCalculatorOpen && Object.keys(stats.rooms).length > 0 && (
          <div className="mb-6 space-y-2 animate-in slide-in-from-top-2">
              {Object.entries(stats.rooms).map(([room, data]) => (
                  <div key={room} className="p-3 bg-black/5 rounded-xl border border-white/5">
                      <div className="flex justify-between mb-1"><span className={`text-xs font-bold ${theme.text}`}>{room}</span><span className={`text-xs font-mono ${data.totalAmps > 12 ? 'text-red-500' : 'text-green-500'}`}>{data.totalAmps.toFixed(1)}A</span></div>
                      <p className="text-[10px] text-slate-500">{aiSuggestions[room] || "Load OK"}</p>
                  </div>
              ))}
          </div>
      )}

      <div onClick={handleToggleRecommendations} className={`${theme.card} p-5 rounded-[2rem] flex items-center justify-between cursor-pointer group active:scale-[0.98] transition-all hover:bg-white/5`}>
        <div className="flex items-center space-x-4"><div className="p-3 rounded-2xl bg-brand-cyan/10 text-brand-cyan"><BrainCircuit size={24} /></div><div><h3 className={`text-sm font-bold ${theme.text}`}>Placement Strategy</h3><p className={`text-[10px] ${theme.subtext}`}>AI Equipment Recommendations</p></div></div>
        <ChevronRight size={18} className={`text-brand-cyan transition-transform ${isAiRecommendationsOpen ? 'rotate-90' : ''}`} />
      </div>

      {isAiRecommendationsOpen && (
          <div className="mb-6 p-4 bg-slate-900/50 rounded-2xl border border-brand-cyan/20 animate-in slide-in-from-top-2">
              {loadingRecommendations ? (
                  <div className="flex items-center space-x-2 text-brand-cyan text-sm py-4 justify-center">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Analyzing project metrics...</span>
                  </div>
              ) : (
                  <div className={`text-sm ${theme.text} whitespace-pre-wrap leading-relaxed`}>
                      {aiRecommendations}
                  </div>
              )}
          </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-4">
             <h3 className={`text-xs font-bold uppercase ${theme.subtext}`}>Deployed Assets</h3>
             <div className="flex items-center space-x-2">
                 {(uniqueTypes.length > 1 || uniqueBrands.length > 1) && (
                     <div className="flex space-x-2">
                        {uniqueTypes.length > 1 && (
                         <select 
                             value={filterType} 
                             onChange={e => setFilterType(e.target.value)}
                             className="bg-slate-900 border border-white/10 text-white text-[10px] uppercase font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-brand-cyan"
                         >
                             <option value="All">All Types</option>
                             {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                         </select>
                        )}
                        {uniqueBrands.length > 1 && (
                         <select 
                             value={filterBrand} 
                             onChange={e => setFilterBrand(e.target.value)}
                             className="bg-slate-900 border border-white/10 text-white text-[10px] uppercase font-bold rounded-lg px-2 py-1 focus:outline-none focus:border-brand-cyan"
                         >
                             <option value="All">All Brands</option>
                             {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
                         </select>
                        )}
                     </div>
                 )}
                 <div className="relative flex items-center space-x-2">
                    <button onClick={() => setIsQRScannerOpen(true)} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-white border border-white/10 px-3 py-1.5 rounded-full font-bold shadow-sm flex items-center gap-1 active:scale-95 transition-all">
                        <ScanLine size={12} /> Scan QR
                    </button>
                    <button onClick={() => setShowAddMenu(!showAddMenu)} className="text-[10px] bg-blue-500 text-white px-3 py-1.5 rounded-full font-bold shadow-sm flex items-center gap-1 active:scale-95 transition-transform">
                        <Plus size={12} /> Add Device
                    </button>
                    {showAddMenu && (
                        <div className="absolute right-0 top-8 w-72 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                            <div className="p-2 bg-slate-950 border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Model</div>
                            <div className="p-2 border-b border-white/5 flex gap-2">
                                <select 
                                    className="flex-1 bg-slate-800 border border-white/10 text-white text-[10px] rounded px-1 py-1"
                                    onChange={(e) => setAddMenuFilterType(e.target.value)}
                                    value={addMenuFilterType}
                                >
                                    <option value="All">All Types</option>
                                    {Array.from(new Set(Object.values(EQUIPMENT_SPECS).map(s => s.type))).map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <select 
                                    className="flex-1 bg-slate-800 border border-white/10 text-white text-[10px] rounded px-1 py-1"
                                    onChange={(e) => setAddMenuFilterBrand(e.target.value)}
                                    value={addMenuFilterBrand}
                                >
                                    <option value="All">All Brands</option>
                                    {Array.from(new Set(Object.keys(EQUIPMENT_SPECS).map(k => k.split(' ')[0]))).map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div className="max-h-64 overflow-y-auto no-scrollbar pb-2">
                                {/* Global Inventory Items First */}
                                {globalInventory.length > 0 && <div className="px-3 text-[9px] font-black tracking-widest text-[#00d4aa] uppercase py-2">Global Inventory</div>}
                                {globalInventory
                                    .filter(inv => inv.status === 'available')
                                    .filter(inv => addMenuFilterType === 'All' || inv.type === addMenuFilterType)
                                    .filter(inv => addMenuFilterBrand === 'All' || inv.model.startsWith(addMenuFilterBrand))
                                    .map((inv) => (
                                    <button key={inv.id} onClick={() => handleSelectModel(inv.id, inv.model)} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0 relative">
                                        <span className="block font-bold pl-3">{inv.model}</span>
                                        <span className="text-[10px] text-slate-500 pl-3">{inv.type} • ID: {inv.id}</span>
                                        <div className="absolute left-1 top-4 w-1 h-1 rounded-full bg-[#00d4aa]"></div>
                                    </button>
                                ))}
                                
                                <div className="px-3 text-[9px] font-black tracking-widest text-slate-600 uppercase py-2 mt-2">Generic Catalog</div>
                                {Object.entries(EQUIPMENT_SPECS)
                                    .filter(([, specs]) => addMenuFilterType === 'All' || specs.type === addMenuFilterType)
                                    .filter(([model]) => addMenuFilterBrand === 'All' || model.startsWith(addMenuFilterBrand))
                                    .map(([model, specs]) => {
                                        const timestamp = Date.now();
                                        const genId = `EQ-${timestamp.toString().slice(-5)}${Math.floor(Math.random()*100)}`;
                                        return (
                                        <button key={model} onClick={() => handleSelectModel(genId, model)} className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors border-b border-white/5 last:border-0">
                                            <span className="block font-bold">{model}</span>
                                            <span className="text-[10px] text-slate-500">{specs.type} • {specs.amps}A</span>
                                        </button>
                                        );
                                })}
                            </div>
                        </div>
                    )}
                 </div>
             </div>
        </div>
        
        {draftEquipment && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
                    <div className="p-4 border-b border-white/10">
                        <h3 className="text-lg font-bold text-white">Deploy Equipment</h3>
                        <p className="text-xs text-brand-cyan mt-1 font-mono">{draftEquipment.model}</p>
                    </div>
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-widest">Placement Location</label>
                            <select 
                                value={draftEquipment.room} 
                                onChange={(e) => setDraftEquipment(prev => prev ? { ...prev, room: e.target.value } : null)}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-cyan"
                            >
                                <option value="General">General / Staging</option>
                                {project.rooms && project.rooms.map(room => (
                                    <option key={room.id} value={room.name}>{room.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-widest">Initial Status</label>
                            <div className="flex rounded-xl overflow-hidden border border-white/10 bg-slate-950">
                                <button 
                                    onClick={() => setDraftEquipment(prev => prev ? { ...prev, status: 'Running' } : null)}
                                    className={`flex-1 py-2 text-xs font-bold transition-colors ${draftEquipment.status === 'Running' ? 'bg-green-500/20 text-green-400' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Running
                                </button>
                                <button 
                                    onClick={() => setDraftEquipment(prev => prev ? { ...prev, status: 'Off' } : null)}
                                    className={`flex-1 py-2 text-xs font-bold transition-colors ${draftEquipment.status === 'Off' ? 'bg-slate-800 text-slate-300' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    Off
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 border-t border-white/10 flex space-x-3">
                        <button onClick={cancelAddEquipment} className="flex-1 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
                        <button onClick={confirmAddEquipment} className="flex-1 py-2 rounded-xl bg-brand-cyan text-slate-900 text-sm font-bold hover:bg-cyan-400 transition-colors">Deploy</button>
                    </div>
                </div>
            </div>
        )}

        {displayedEquipment.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-black/5 border border-white/5 rounded-2xl">
                No equipment matches the selected filters.
            </div>
        ) : (
            <div className="space-y-4">
                {displayedEquipment.map((item) => (
              <div key={item.id} className={`${theme.card} p-4 rounded-2xl relative overflow-hidden group`}>
                {item.status === 'Running' && (<div className="absolute top-0 right-0 w-16 h-16"><div className="absolute transform rotate-45 bg-green-500 text-white text-[8px] font-bold py-1 px-8 top-3 -right-6 text-center uppercase">Active</div></div>)}
                <div className="flex items-start space-x-4">
                    <div className={`p-3 rounded-xl ${item.status === 'Running' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-700 text-slate-500'}`}><Wind size={24} /></div>
                    <div className="flex-1">
                        <div className="flex justify-between"><h3 className={`font-bold ${theme.text}`}>{item.model}</h3><span className={`text-[10px] font-bold ${theme.subtext}`}>{item.id}</span></div>
                        <div className={`text-xs ${theme.subtext} mt-0.5`}>{item.type} • {item.room}</div>
                            <div className="mt-4 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                {editingHoursId === item.id ? (
                                    <div className="flex items-center space-x-2">
                                        <input
                                            autoFocus
                                            type="number"
                                            value={tempHours}
                                            onChange={(e) => setTempHours(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleUpdateHours(item.id, parseFloat(tempHours));
                                                if (e.key === 'Escape') setEditingHoursId(null);
                                            }}
                                            className="w-16 bg-slate-950 border border-brand-cyan/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
                                        />
                                        <button 
                                            onClick={() => handleUpdateHours(item.id, parseFloat(tempHours))}
                                            className="text-[10px] text-brand-cyan font-bold uppercase"
                                        >
                                            Save
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => {
                                            setEditingHoursId(item.id);
                                            setTempHours(item.hours.toString());
                                        }}
                                        className={`flex items-center text-sm ${theme.subtext} hover:text-white transition-colors group/hours`}
                                    >
                                        <Clock size={14} className="mr-1 group-hover/hours:text-brand-cyan" /> 
                                        <span>{item.hours}h</span>
                                        <Pencil size={10} className="ml-1 opacity-0 group-hover/hours:opacity-100 transition-opacity" />
                                    </button>
                                )}
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={() => handleToggleStatus(item.id)} className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${item.status === 'Running' ? 'border-red-500/20 text-red-400 bg-red-500/10' : 'border-green-500/20 text-green-400 bg-green-500/10'}`}>
                                    <Power size={14} /><span>{item.status === 'Running' ? 'Stop' : 'Start'}</span>
                                </button>
                                <button onClick={() => handleReturnEquipment(item.id)} className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all border-slate-500/20 text-slate-400 bg-slate-500/10 hover:text-white hover:bg-slate-700">
                                    <span>Retrieve</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
              </div>
            ))}
            </div>
        )}

        {isQRScannerOpen && (
            <QRScanner onScan={handleQRScan} onClose={() => setIsQRScannerOpen(false)} />
        )}

      </div>
    </div>
  );
};

export default EquipmentManager;
