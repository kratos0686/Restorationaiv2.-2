import React, { useState, useRef } from 'react';
import { Play, Camera, ChevronDown, Save, ArrowLeft, Plus, Image as ImageIcon, Box, Thermometer, Wind, Check, Trash2, Droplets, Layers, Radio } from 'lucide-react';
import { calculatePsychrometricsFromDryBulb } from '../utils/psychrometrics';
import { useAppContext } from '../context/AppContext';
import { Project, TrackedMaterial } from '../types';
import { EventBus } from '../services/EventBus';
import { generateDailyDryingNarrative } from '../services/api';
import { BUILDING_MATERIALS } from '../data/materials';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReportGenerator from './ReportGenerator';
import { MoistureLogTable } from './MoistureLogTable';

interface BluetoothValueEvent {
  target: {
    value: DataView;
  };
}

interface GattCharacteristic {
  startNotifications: () => Promise<void>;
  addEventListener: (type: 'characteristicvaluechanged', listener: (e: BluetoothValueEvent) => void) => void;
}

interface GattService {
  getCharacteristic: (characteristic: string | number) => Promise<GattCharacteristic>;
}

interface GattServer {
  connect: () => Promise<GattServer>;
  getPrimaryService: (service: string | number) => Promise<GattService>;
}

interface BluetoothDevice {
  gatt?: GattServer;
  name?: string;
  addEventListener: (type: 'gattserverdisconnected', listener: () => void) => void;
}

interface WebBluetoothNavigator {
  bluetooth?: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices?: (string | number)[] }) => Promise<BluetoothDevice>;
  };
}

interface DryingLogsProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

const DryingLogs: React.FC<DryingLogsProps> = ({ project, onUpdate }) => {
  const { currentUser, settings } = useAppContext();
  const tempUnit = settings.units.temperature === 'Fahrenheit' ? '°F' : '°C';
  const [isLogging, setIsLogging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [now] = useState(() => new Date().getTime());
  const [showPsychReport, setShowPsychReport] = useState(false);

  // Web Bluetooth BLE ESP32 telemetry integrations
  const [bleStatus, setBleStatus] = useState<Record<string, 'disconnected' | 'connecting' | 'connected' | 'simulating'>>({});

  const startSimulation = (zoneKey: string, onChangeTemp: (val: string) => void, onChangeRh: (val: string) => void) => {
    setBleStatus(prev => ({ ...prev, [zoneKey]: 'simulating' }));
    
    EventBus.publish(
      'com.restorationai.telemetry.bluetooth.simulated',
      { zoneKey },
      project.id,
      `IFrame sandbox detected. Simulating live ESP32 Psychrometric Node [${zoneKey}]`,
      'info'
    );
    
    let currentTemp = 73.2;
    let currentRh = 48.5;
    
    onChangeTemp(currentTemp.toFixed(1));
    onChangeRh(currentRh.toFixed(1));

    const interval = setInterval(() => {
      setBleStatus(prev => {
        if (prev[zoneKey] !== 'simulating') {
          clearInterval(interval);
          return prev;
        }
        
        currentTemp += (Math.random() - 0.5) * 0.3;
        currentRh += (Math.random() - 0.5) * 0.5;
        
        if (currentTemp < 45) currentTemp = 45;
        if (currentTemp > 110) currentTemp = 110;
        if (currentRh < 5) currentRh = 5;
        if (currentRh > 98) currentRh = 98;

        onChangeTemp(currentTemp.toFixed(1));
        onChangeRh(currentRh.toFixed(1));
        
        // Stream telemetry through cloud-event bus
        EventBus.publish('com.restorationai.telemetry.reading', {
            sensorType: 'BLE_ESP32_PSYCHROMETRIC_NODE',
            zone: zoneKey,
            temp: parseFloat(currentTemp.toFixed(1)),
            rh: parseFloat(currentRh.toFixed(1)),
            unit: settings.units.temperature
        });

        return prev;
      });
    }, 2800);
  };

  const connectBluetooth = async (zoneKey: string, onChangeTemp: (val: string) => void, onChangeRh: (val: string) => void) => {
    setBleStatus(prev => ({ ...prev, [zoneKey]: 'connecting' }));
    
    const nav = navigator as unknown as WebBluetoothNavigator;
    if (!nav.bluetooth) {
      console.warn('Web Bluetooth not supported.');
      startSimulation(zoneKey, onChangeTemp, onChangeRh);
      return;
    }

    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['environmental_sensing', '0000181a-0000-1000-8000-00805f9b34fb']
      });

      if (!device.gatt) {
        throw new Error('No GATT service');
      }

      const server = await device.gatt.connect();
      setBleStatus(prev => ({ ...prev, [zoneKey]: 'connected' }));

      device.addEventListener('gattserverdisconnected', () => {
        setBleStatus(prev => ({ ...prev, [zoneKey]: 'disconnected' }));
      });

      const service = await server.getPrimaryService('environmental_sensing')
        .catch(() => server.getPrimaryService('0000181a-0000-1000-8000-00805f9b34fb'));

      const tempChar = await service.getCharacteristic('00002a6e-0000-1000-8000-00805f9b34fb')
        .catch(() => service.getCharacteristic(0x2A6E));

      const rhChar = await service.getCharacteristic('00002a6f-0000-1000-8000-00805f9b34fb')
        .catch(() => service.getCharacteristic(0x2A6F));

      if (tempChar) {
        await tempChar.startNotifications();
        tempChar.addEventListener('characteristicvaluechanged', (e: BluetoothValueEvent) => {
          const view = e.target.value;
          const rawTemp = view.getInt16(0, true) / 100;
          const finalTemp = settings.units.temperature === 'Fahrenheit' ? (rawTemp * 9/5 + 32) : rawTemp;
          onChangeTemp(finalTemp.toFixed(1));
        });
      }

      if (rhChar) {
        await rhChar.startNotifications();
        rhChar.addEventListener('characteristicvaluechanged', (e: BluetoothValueEvent) => {
          const view = e.target.value;
          const rawRh = view.getUint16(0, true) / 100;
          onChangeRh(rawRh.toFixed(1));
        });
      }

      EventBus.publish('com.restorationai.telemetry.bluetooth.connected', { deviceName: device.name, zoneKey }, project.id, `BLE Sensor Connected: ${device.name}`, 'success');

    } catch (error) {
      console.warn('Bluetooth pairing connection failed or cancelled. Falling back to emulator.', error);
      startSimulation(zoneKey, onChangeTemp, onChangeRh);
    }
  };

  const disconnectBluetooth = (zoneKey: string) => {
    setBleStatus(prev => ({ ...prev, [zoneKey]: 'disconnected' }));
    EventBus.publish('com.restorationai.telemetry.bluetooth.disconnected', { zoneKey }, project.id, `BLE Sensor [${zoneKey}] Link Closed`, 'info');
  };

  const trackedMaterials = project.dryingMonitor || [];
  const equipment = project.equipment || [];

  const [isChamberModalOpen, setIsChamberModalOpen] = useState(false);
  const [newChamberName, setNewChamberName] = useState('');
  const [selectedRoomsForChamber, setSelectedRoomsForChamber] = useState<string[]>([]);

  const [activeTabId, setActiveTabId] = useState<string>('summary');

  // Interactive Form State
  const [logData, setLogData] = useState({
    visitType: 'Day 1',
    overallStatus: 'Drying',
    atmospherics: {
      outside: { temp: '', rh: '' },
      unaffected: { temp: '', rh: '' },
      rooms: (project.rooms || []).reduce((acc, r) => ({ ...acc, [r.id]: { temp: '', rh: '' } }), {} as Record<string, { temp: '', rh: '' }>),
      dehus: equipment.filter(eq => eq.type === 'Dehumidifier').reduce((acc, eq) => ({ ...acc, [eq.id]: { temp: '', rh: '' } }), {} as Record<string, { temp: '', rh: '' }>)
    },
    moisture: {} as Record<string, string>,
    demoed: {} as Record<string, { isDemoed: boolean; quantity: string }>,
    equipment: equipment.reduce((acc, eq) => ({ ...acc, [eq.id]: eq.status }), {} as Record<string, string>),
    consumables: 0,
    notes: '',
    newMaterialsToAdd: [] as { id: string, name: string, location: string, goal: string, reading: string }[],
    photos: [] as { id: string, url: string, roomId: string }[]
  });

  const [isMaterialChecklistOpen, setIsMaterialChecklistOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const materialsByLocation = trackedMaterials.reduce((acc, mat) => {
    if (!acc[mat.location]) acc[mat.location] = [];
    acc[mat.location].push(mat);
    return acc;
  }, {} as Record<string, TrackedMaterial[]>);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, selectedRoomId: string) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const mappedPhotos = filesArray.map(file => ({
        id: `photo-${Date.now()}-${Math.random()}`,
        url: URL.createObjectURL(file), // Using object URL to display instantly
        roomId: selectedRoomId
      }));
      setLogData(prev => ({
        ...prev,
        photos: [...prev.photos, ...mappedPhotos]
      }));
    }
  };

  const handleChecklistToggle = (matName: string, locationName: string) => {
    setLogData(prev => {
      const exists = prev.newMaterialsToAdd.find(m => m.name === matName && m.location === locationName);
      if (exists) {
        return { ...prev, newMaterialsToAdd: prev.newMaterialsToAdd.filter(m => !(m.name === matName && m.location === locationName)) };
      } else {
        return {
          ...prev,
          newMaterialsToAdd: [...prev.newMaterialsToAdd, {
            id: `new-mat-${Date.now()}-${Math.random()}`,
            name: matName,
            location: locationName,
            goal: '12', // default general target
            reading: ''
          }]
        };
      }
    });
  };

  const updateNewMaterial = (id: string, field: 'goal' | 'reading', value: string) => {
    setLogData(prev => ({
      ...prev,
      newMaterialsToAdd: prev.newMaterialsToAdd.map(m => m.id === id ? { ...m, [field]: value } : m)
    }));
  };

  const removeNewMaterial = (id: string) => {
    setLogData(prev => ({
      ...prev,
      newMaterialsToAdd: prev.newMaterialsToAdd.filter(m => m.id !== id)
    }));
  };

  const handleSaveLog = async () => {
    setIsSaving(true);
    const timestamp = new Date().getTime();
    
    // 1. Narrative & Structure Check
    let narrative = `${logData.visitType} - ${logData.overallStatus}. `;
    
    const out = logData.atmospherics.outside;
    const unaff = logData.atmospherics.unaffected;
    if (out?.temp && out?.rh) narrative += `Outside: ${out.temp}${tempUnit}/${out.rh}%. `;
    if (unaff?.temp && unaff?.rh) narrative += `Unaffected: ${unaff.temp}${tempUnit}/${unaff.rh}%. `;

    // 2. Room Updates (readings + photos)
    const updatedRooms = (project.rooms || []).map(r => {
      const roomPhotos = logData.photos.filter(p => p.roomId === r.id).map(p => ({
        id: p.id,
        url: p.url,
        timestamp,
        tags: ['Daily Log', r.name],
        notes: `Uploaded during ${logData.visitType}`
      }));
      
      const newRoomPhotos = [...(r.photos || []), ...roomPhotos];

      const data = logData.atmospherics.rooms[r.id];
      if (data && data.temp && data.rh) {
        narrative += `${r.name}: ${data.temp}${tempUnit}/${data.rh}%. `;
        let tempNum = parseFloat(data.temp);
        const rhNum = parseFloat(data.rh);
        if (!isNaN(tempNum) && !isNaN(rhNum)) {
          if (settings.units.temperature === 'Celsius') {
            tempNum = (tempNum * 9 / 5) + 32;
          }
          const psych = calculatePsychrometricsFromDryBulb(tempNum, rhNum);
          return {
            ...r,
            photos: newRoomPhotos,
            readings: [...(r.readings || []), { timestamp, temp: tempNum, rh: rhNum, gpp: psych.gpp, mc: 0, dewPoint: psych?.dewPoint, vaporPressure: psych?.vaporPressure, enthalpy: psych?.enthalpy }]
          };
        }
      }
      return { ...r, photos: newRoomPhotos };
    });

    // 2.5 Chamber Updates
    const updatedChambers = (project.dryingChambers || []).map(c => {
      const chamberPhotos = logData.photos.filter(p => p.roomId === c.id).map(p => ({
        id: p.id,
        url: p.url,
        timestamp,
        tags: ['Daily Log', c.name],
        notes: `Uploaded during ${logData.visitType}`
      }));
      
      const newChamberPhotos = [...(c.photos || []), ...chamberPhotos];

      const data = logData.atmospherics.rooms[c.id];
      if (data && data.temp && data.rh) {
        narrative += `${c.name}: ${data.temp}${tempUnit}/${data.rh}%. `;
        let tempNum = parseFloat(data.temp);
        const rhNum = parseFloat(data.rh);
        if (!isNaN(tempNum) && !isNaN(rhNum)) {
          if (settings.units.temperature === 'Celsius') {
            tempNum = (tempNum * 9 / 5) + 32;
          }
          const psych = calculatePsychrometricsFromDryBulb(tempNum, rhNum);
          return {
            ...c,
            photos: newChamberPhotos,
            readings: [...(c.readings || []), { timestamp, temp: tempNum, rh: rhNum, gpp: psych.gpp, mc: 0, dewPoint: psych?.dewPoint, vaporPressure: psych?.vaporPressure, enthalpy: psych?.enthalpy }]
          };
        }
      }
      return { ...c, photos: newChamberPhotos };
    });

    // 3. Materials Update
    const newMaterials = trackedMaterials.map(mat => {
      const demoData = logData.demoed[mat.id];
      if (demoData?.isDemoed) {
        if (demoData.quantity) {
          narrative += `Removed ${demoData.quantity} of ${mat.name} in ${mat.location}. `;
        } else {
          narrative += `Removed ${mat.name} in ${mat.location}. `;
        }
        return {
          ...mat,
          status: 'Removed' as const,
          demoQuantity: parseFloat(demoData.quantity) || undefined
        };
      }

      const readingStr = logData.moisture[mat.id];
      if (readingStr) {
        const readingVal = parseFloat(readingStr);
        return {
          ...mat,
          status: readingVal <= mat.dryGoal ? 'Dry' as const : 'Wet' as const,
          readings: [...mat.readings, { timestamp, value: readingVal, dateStr: new Date().toLocaleDateString(undefined, { weekday: 'short' }) }]
        };
      }
      return mat;
    });

    logData.newMaterialsToAdd.forEach(newMat => {
      const readingVal = parseFloat(newMat.reading);
      const goalVal = parseFloat(newMat.goal);
      if (!isNaN(readingVal) && !isNaN(goalVal)) {
        const chamber = project.dryingChambers?.find(c => c.name === newMat.location);
        newMaterials.push({
          id: newMat.id,
          name: newMat.name,
          location: newMat.location,
          chamberId: chamber?.id,
          type: newMat.name,
          dryGoal: goalVal,
          initialReading: readingVal,
          readings: [{ timestamp, value: readingVal, dateStr: new Date().toLocaleDateString(undefined, { weekday: 'short' }) }],
          status: readingVal <= goalVal ? 'Dry' as const : 'Wet' as const
        });
        narrative += `Added ${newMat.name} in ${newMat.location} at ${readingVal}%. `;
      }
    });

    // 4. Equipment
    const newEquipment = equipment.map(eq => ({
      ...eq,
      status: logData.equipment[eq.id] as 'Running' | 'Off' | 'Removed'
    }));

    if (logData.notes) narrative += `Notes: ${logData.notes} `;

    // 5. Build AI Narrative safely
    let aiNarrative = narrative;
    try {
      const psychrometricReadings = updatedRooms.flatMap(r => r.readings || []);
      const generated = await generateDailyDryingNarrative({
        date: new Date().toLocaleDateString(),
        psychrometricReadings: psychrometricReadings.slice(-10),
        trackedMaterials: newMaterials
      });
      if (generated) {
         aiNarrative = generated;
      }
    } catch(e) {
      console.warn("AI Log generation fallback to manual due to error", e);
    }
    
    EventBus.publish('com.restorationai.drying.recorded', { projectId: project.id, logData }, project.id, 'Drying Log Saved', 'success');

    if (onUpdate) {
      onUpdate({
        rooms: updatedRooms,
        dryingChambers: updatedChambers,
        dryingMonitor: newMaterials,
        equipment: newEquipment,
        dailyNarratives: [{
          id: `log-${timestamp}`,
          date: new Date().toLocaleDateString(),
          timestamp: timestamp,
          content: aiNarrative,
          author: currentUser?.name || 'Tech',
          tags: ['Psychrometrics', 'Daily Log', 'AI Generated'],
          generated: true
        }, ...(project.dailyNarratives || [])]
      });
    }

    setIsLogging(false);
    setIsSaving(false);
  };

  const renderZoneInput = (
    data: { temp: string; rh: string },
    onChangeTemp: (val: string) => void,
    onChangeRh: (val: string) => void,
    label: string,
    subtitle?: string
  ) => {
    let tempNum = parseFloat(data.temp);
    const rhNum = parseFloat(data.rh);
    const hasData = !isNaN(tempNum) && !isNaN(rhNum);
    if (hasData && settings.units.temperature === 'Celsius') {
      tempNum = (tempNum * 9 / 5) + 32;
    }
    const psych = hasData ? calculatePsychrometricsFromDryBulb(tempNum, rhNum) : null;
    const status = bleStatus[label] || 'disconnected';

    return (
      <div className="bg-black/20 border border-white/5 rounded-xl p-4 relative overflow-hidden">
        {status !== 'disconnected' && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-brand-cyan via-indigo-500 to-emerald-500 animate-pulse" />
        )}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h4 className="text-sm font-black text-white tracking-widest uppercase flex items-center gap-2">
              <Thermometer size={14} className="text-brand-cyan" />
              <span>{label}</span>
            </h4>
            {subtitle && <p className="text-[10px] text-slate-400 font-bold uppercase">{subtitle}</p>}
          </div>

          <div className="flex items-center">
            {status === 'disconnected' && (
              <button
                type="button"
                onClick={() => connectBluetooth(label, onChangeTemp, onChangeRh)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/20 rounded-xl transition-all"
              >
                <Radio size={10} className="animate-pulse" />
                <span>Pair Sensor</span>
              </button>
            )}
            {status === 'connecting' && (
              <span className="flex items-center space-x-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-xl">
                <span className="w-1 px-[1px] h-1 rounded-full bg-yellow-500 animate-ping" />
                <span>Pairing...</span>
              </span>
            )}
            {(status === 'connected' || status === 'simulating') && (
              <button
                type="button"
                onClick={() => disconnectBluetooth(label)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-xl border transition-all ${
                  status === 'connected'
                    ? 'bg-emerald-500/10 hover:bg-red-500/10 text-emerald-400 hover:text-red-400 border-emerald-500/20 hover:border-red-500/20'
                    : 'bg-indigo-500/10 hover:bg-red-500/10 text-indigo-400 hover:text-red-400 border-indigo-500/20 hover:border-red-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-emerald-400' : 'bg-indigo-400'} animate-bounce`} />
                <span>{status === 'connected' ? 'BLE Active' : 'Emulator On'} (Disconnect)</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Temperature ({tempUnit})</label>
            <input type="number" value={data.temp} onChange={e => onChangeTemp(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-3 text-lg font-black text-center text-white outline-none focus:border-brand-cyan" placeholder="--" />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Humidity (%)</label>
            <input type="number" value={data.rh} onChange={e => onChangeRh(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-3 text-lg font-black text-center text-white outline-none focus:border-brand-cyan" placeholder="--" />
          </div>
        </div>
        {hasData && psych && (
          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/5 opacity-80">
            <div><p className="text-[9px] text-slate-500 uppercase font-bold">GPP</p><p className="font-mono text-brand-cyan font-bold text-xs">{psych.gpp}</p></div>
            <div><p className="text-[9px] text-slate-500 uppercase font-bold">DEW POINT</p><p className="font-mono text-brand-cyan font-bold text-xs">{settings.units.temperature === 'Fahrenheit' ? psych.dewPoint : ((psych.dewPoint - 32) * 5 / 9).toFixed(1)}°</p></div>
            <div><p className="text-[9px] text-slate-500 uppercase font-bold">VAPOR P.</p><p className="font-mono text-brand-cyan font-bold text-xs">{psych.vaporPressure}</p></div>
            <div><p className="text-[9px] text-slate-500 uppercase font-bold">ENTHALPY</p><p className="font-mono text-brand-cyan font-bold text-xs">{psych.enthalpy}</p></div>
          </div>
        )}
      </div>
    );
  };

  const getMoistureColor = (readingStr: string, goal: number) => {
    if (!readingStr) return 'border-white/10 text-white';
    const reading = parseFloat(readingStr);
    if (isNaN(reading)) return 'border-white/10 text-white';
    if (reading <= goal) return 'border-emerald-500 text-emerald-400 bg-emerald-500/10';
    if (reading <= goal * 1.2) return 'border-yellow-500 text-yellow-400 bg-yellow-500/10';
    return 'border-red-500 text-red-400 bg-red-500/10';
  };

  const processDashboardChartData = () => {
    const dailyData: Record<string, { tempSum: number; rhSum: number; gppSum: number; count: number }> = {};
    
    (project.rooms || []).forEach(room => {
      (room.readings || []).forEach(r => {
        if (!r.timestamp || r.temp === undefined || r.rh === undefined) return;
        
        // Group by yyyy-mm-dd for consistent sorting
        const dateObj = new Date(r.timestamp);
        const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        
        if (!dailyData[dateKey]) {
            dailyData[dateKey] = { tempSum: 0, rhSum: 0, gppSum: 0, count: 0 };
        }
        dailyData[dateKey].tempSum += r.temp;
        dailyData[dateKey].rhSum += r.rh;
        dailyData[dateKey].gppSum += r.gpp || 0;
        dailyData[dateKey].count += 1;
      });
    });

    return Object.keys(dailyData).sort().map(dateKey => {
        const d = dailyData[dateKey];
        const [year, month, day] = dateKey.split('-');
        const dateLabel = new Date(parseInt(year), parseInt(month)-1, parseInt(day)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        
        return {
            date: dateLabel,
            Temp: parseFloat((d.tempSum / d.count).toFixed(1)),
            RH: parseFloat((d.rhSum / d.count).toFixed(1)),
            GrainDepression: parseFloat((d.gppSum / d.count).toFixed(1)) // Represents GPP or specific humidity
        };
    });
  };

  const dashChartData = processDashboardChartData();

  if (!isLogging) {
      // DASHBOARD VIEW
      return (
        <div className="space-y-6 pb-24">
          <div className="bg-gradient-to-br from-brand-blue/20 to-brand-cyan/10 border border-brand-cyan/30 rounded-[2rem] p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-cyan/20 blur-[50px] rounded-full" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">{project.client}</h2>
                  <p className="text-sm text-brand-cyan font-medium">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                </div>
                <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Day {Math.max(1, Math.floor((now - new Date(project.startDate || now).getTime()) / (1000 * 60 * 60 * 24)))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <button onClick={() => setIsLogging(true)} className="w-full py-4 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center space-x-2 shadow-lg shadow-brand-cyan/20 transition-all active:scale-95">
                  <Play size={18} fill="currentColor" />
                  <span>Perform Daily Dry Log</span>
                </button>
                <button onClick={() => setShowPsychReport(true)} className="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center space-x-2 transition-all active:scale-95">
                  <Droplets size={18} className="text-sky-400" />
                  <span>Export Psychrometric PDF</span>
                </button>
              </div>
            </div>
          </div>
  
          {dashChartData.length > 0 && (
            <div className="bg-slate-900 border border-white/10 rounded-[2rem] p-6">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Psychrometric Monitoring Dashboard</h3>
              <div className="h-64 w-full">
                  <ResponsiveContainer width="99%" height="100%">
                      <LineChart data={dashChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                          <Tooltip 
                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                              itemStyle={{ fontWeight: 'bold' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Line yAxisId="left" type="monotone" dataKey="Temp" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 5 }} name={`Avg Temp (${tempUnit})`} />
                          <Line yAxisId="left" type="monotone" dataKey="RH" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} activeDot={{ r: 5 }} name="Avg RH (%)" />
                          <Line yAxisId="right" type="monotone" dataKey="GrainDepression" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} name="Grain Depression (GPP)" connectNulls />
                      </LineChart>
                  </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mt-4">Automated tracking of psychrometric drying progress against IICRC records.</p>
            </div>
          )}

          <div className="bg-slate-900 border border-white/10 rounded-[2rem] p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Drying Progress Overview</h3>
            <div>
                <div className="flex justify-between text-xs font-bold text-white mb-2">
                  <span>Materials at Dry Standard</span>
                  <span className="text-brand-cyan">{trackedMaterials.filter(m => m.status === 'Dry').length} / {trackedMaterials.length}</span>
                </div>
                <div className="h-2 bg-black rounded-full overflow-hidden">
                  <div className="h-full bg-brand-cyan rounded-full transition-all" style={{ width: `${trackedMaterials.length ? (trackedMaterials.filter(m => m.status === 'Dry').length / trackedMaterials.length) * 100 : 0}%` }} />
                </div>
            </div>
            {Object.entries(materialsByLocation).length === 0 ? (
                <div className="text-center py-6 mt-4 text-slate-500 font-medium bg-black/20 rounded-xl">No materials mapped yet. Start a daily log to add materials.</div>
            ) : (
                <div className="mt-8 space-y-6">
                    {Object.entries(materialsByLocation).map(([loc, mats]) => (
                        <div key={loc}>
                            <h4 className="text-sm font-bold text-white border-b border-white/10 pb-2 mb-3">{loc}</h4>
                            <div className="grid gap-2">
                                {mats.map(mat => (
                                    <div key={mat.id} className="flex justify-between items-center bg-black/30 p-2 rounded border border-white/5">
                                        <div>
                                            <div className="text-xs font-bold text-slate-200">{mat.name}</div>
                                            <div className="text-[10px] text-slate-500">Goal: {mat.dryGoal}%</div>
                                        </div>
                                        <div className={`font-mono text-xs font-bold px-2 py-1 rounded ${mat.status === 'Dry' ? 'bg-emerald-500/20 text-emerald-400' : mat.status === 'Removed' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                            {mat.status} {mat.readings.length > 0 ? `(${mat.readings[mat.readings.length - 1].value}%)` : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
          
          {/* Detailed Historical Digital Log */}
          <MoistureLogTable project={project} />
        </div>
      );
  }

  // LOGGING VIEW (Streamlined Single Page)

  // Derived chambers: use project.dryingChambers if any, 
  // otherwise we can just use rooms as individual chambers or let them create them.
  // Actually, let's treat every entry in the dropdown as a 'Zone'.
  const chambers = project.dryingChambers || [];
  const assignedRoomIds = new Set(chambers.flatMap(c => c.roomIds));
  const unassignedRooms = (project.rooms || []).filter(r => !assignedRoomIds.has(r.id));
  
  const roomTabs = [
      { id: 'summary', name: 'Global Data', type: 'global', entity: null },
      ...chambers.map(c => ({ id: `chamber-${c.id}`, name: `Chamber: ${c.name}`, type: 'chamber', entity: c })),
      ...unassignedRooms.map(r => ({ id: r.id, name: r.name, type: 'room', entity: r }))
  ];

  const handleCreateChamber = () => {
    if (!newChamberName || selectedRoomsForChamber.length === 0) return;
    const newChamber = {
        id: `chamber-${Date.now()}`,
        name: newChamberName,
        roomIds: selectedRoomsForChamber,
        readings: [],
        status: 'active' as const
    };
    if (onUpdate) {
        onUpdate({ dryingChambers: [...chambers, newChamber] });
    }
    setIsChamberModalOpen(false);
    setNewChamberName('');
    setSelectedRoomsForChamber([]);
    setActiveTabId(`chamber-${newChamber.id}`);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in slide-in-from-bottom duration-300">
      <div className="pt-12 pb-4 px-6 bg-slate-900 border-b border-white/10 flex items-center justify-between shrink-0">
        <button onClick={() => setIsLogging(false)} className="p-2 -ml-2 text-slate-400 hover:text-white flex items-center space-x-2">
          <ArrowLeft size={24} /> <span className="font-bold">Cancel</span>
        </button>
        <button 
            onClick={handleSaveLog} 
            disabled={isSaving}
            className="bg-brand-cyan hover:bg-cyan-400 text-slate-900 px-4 py-2 rounded-lg font-black uppercase tracking-widest flex items-center space-x-2 active:scale-95 transition-all text-sm disabled:opacity-50"
        >
          {isSaving ? <span className="animate-pulse">Generating...</span> : <><Save size={16}/><span>Complete Log</span></>}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0B1120]">
              <div className="max-w-4xl mx-auto space-y-8 pb-20">
                  {/* TAB SELECTOR HEADER */}
                  <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 md:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                     <div className="flex items-center space-x-4">
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Section</span>
                         <div className="relative">
                             <select 
                                value={activeTabId}
                                onChange={e => setActiveTabId(e.target.value)}
                                className="bg-black/50 border border-white/10 text-white rounded-xl px-4 py-2.5 font-bold outline-none focus:border-brand-cyan appearance-none pr-10"
                             >
                                {roomTabs.map(tab => (
                                   <option key={tab.id} value={tab.id}>{tab.name}</option>
                                ))}
                             </select>
                             <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                         </div>
                     </div>
                     <button 
                        onClick={() => setIsChamberModalOpen(true)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center space-x-2 transition-all shrink-0"
                     >
                         <Plus size={14} /> <span>Combine Rooms to Chamber</span>
                     </button>
                  </div>

                  {/* GLOBAL TAB */}
                  {activeTabId === 'summary' && (
                      <div className="space-y-8 animate-in fade-in duration-300">
                           <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 space-y-6">
                               <h2 className="text-xl font-black text-white">Global Information</h2>
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Visit Type</label>
                                      <select value={logData.visitType} onChange={e => setLogData({...logData, visitType: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-brand-cyan">
                                        <option>Initial Extraction</option>
                                        <option>Day 1</option>
                                        <option>Day 2</option>
                                        <option>Day 3</option>
                                        <option>Final Monitoring</option>
                                      </select>
                                  </div>
                                  <div className="space-y-1">
                                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Overall Status</label>
                                      <select value={logData.overallStatus} onChange={e => setLogData({...logData, overallStatus: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-brand-cyan">
                                        <option>Drying</option>
                                        <option>Stable</option>
                                        <option>Ready for Teardown</option>
                                        <option>Completed</option>
                                      </select>
                                  </div>
                               </div>

                               <div className="grid md:grid-cols-2 gap-6 mt-6">
                                   {renderZoneInput(logData.atmospherics.outside, (v) => setLogData(p => ({...p, atmospherics: {...p.atmospherics, outside: {...p.atmospherics.outside, temp: v}}})), (v) => setLogData(p => ({...p, atmospherics: {...p.atmospherics, outside: {...p.atmospherics.outside, rh: v}}})), 'Outside Env.')}
                                   {renderZoneInput(logData.atmospherics.unaffected, (v) => setLogData(p => ({...p, atmospherics: {...p.atmospherics, unaffected: {...p.atmospherics.unaffected, temp: v}}})), (v) => setLogData(p => ({...p, atmospherics: {...p.atmospherics, unaffected: {...p.atmospherics.unaffected, rh: v}}})), 'Unaffected Env.')}
                               </div>

                               <div className="space-y-1 pt-4 border-t border-white/5">
                                   <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Technician Notes</label>
                                   <textarea 
                                       value={logData.notes}
                                       onChange={e => setLogData({...logData, notes: e.target.value})}
                                       className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white outline-none focus:border-brand-cyan min-h-[120px] resize-none"
                                       placeholder="General observations, summary..."
                                   />
                               </div>
                           </div>
                      </div>
                  )}

                  {/* ROOM OR CHAMBER TAB */}
                  {activeTabId !== 'summary' && (
                      <div className="space-y-8 animate-in fade-in duration-300">
                          {(() => {
                              const activeTab = roomTabs.find(t => t.id === activeTabId);
                              if (!activeTab || activeTab.type === 'global') return null;
                              
                              const isChamber = activeTab.type === 'chamber';
                              const entityId = isChamber ? activeTab.entity.id : activeTab.entity.id;
                              const entityName = isChamber ? activeTab.entity.name : activeTab.entity.name;
                              
                              // Materials can belong to a location (room name) or chamberId
                              const roomMaterials = trackedMaterials.filter(m => m.location === entityName);
                              const newRoomMaterials = logData.newMaterialsToAdd.filter(m => m.location === entityName);
                              
                              // For photos, we just link them by entity schema for now
                              const pendingPhotos = logData.photos.filter(p => p.roomId === entityId);

                              // Calculate sq footage for air mover suggestion
                              let sqFt = 0;
                              if (isChamber) {
                                  const chamberRooms = project.rooms?.filter(r => (activeTab.entity as any).roomIds?.includes(r.id)) || [];
                                  sqFt = chamberRooms.reduce((acc, r) => {
                                      const l = r.dimensions?.length || 0;
                                      const w = r.dimensions?.width || 0;
                                      return acc + (l * w);
                                  }, 0);
                              } else {
                                  const l = (activeTab.entity as any).dimensions?.length || 0;
                                  const w = (activeTab.entity as any).dimensions?.width || 0;
                                  sqFt = l * w;
                              }
                              const estimatedAirMovers = sqFt > 0 ? Math.ceil(sqFt / 14) + 1 : 0;

                              const chartData = (activeTab.entity.readings || []).map(r => {
                                  const dateStr = new Date(r.timestamp).toLocaleDateString();
                                  
                                  let totalMoisture = 0;
                                  let count = 0;
                                  
                                  roomMaterials.forEach(m => {
                                      const matchingReading = m.readings?.find(mr => new Date(mr.timestamp).toLocaleDateString() === dateStr);
                                      if (matchingReading) {
                                          totalMoisture += matchingReading.value;
                                          count++;
                                      }
                                  });

                                  return {
                                      date: new Date(r.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                                      Temp: r.temp,
                                      RH: r.rh,
                                      AvgMoisture: count > 0 ? parseFloat((totalMoisture / count).toFixed(1)) : undefined
                                  }
                              });

                              return (
                                  <>
                                      <div className="flex items-center justify-between">
                                          <h2 className="text-2xl font-black text-white tracking-tight">{entityName}</h2>
                                          <button className="bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center space-x-2 transition-all">
                                              <Box size={16} /> <span>Link 3D Scan Data</span>
                                          </button>
                                      </div>

                                      {/* Atmospherics */}
                                      {renderZoneInput(
                                          logData.atmospherics.rooms[entityId] || { temp: '', rh: '' },
                                          (v) => setLogData(p => ({...p, atmospherics: { ...p.atmospherics, rooms: { ...p.atmospherics.rooms, [entityId]: { temp: v, rh: p.atmospherics.rooms[entityId]?.rh || '' } } }})),
                                          (v) => setLogData(p => ({...p, atmospherics: { ...p.atmospherics, rooms: { ...p.atmospherics.rooms, [entityId]: { temp: p.atmospherics.rooms[entityId]?.temp || '', rh: v } } }})),
                                          isChamber ? 'Chamber Atmospherics' : 'Room Atmospherics',
                                          isChamber ? 'Combined Drying Zone' : ((activeTab.entity as any).roomType || 'General Area')
                                      )}

                                      {/* Trends Visualization */}
                                      {chartData.length > 0 && (
                                          <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 space-y-4">
                                              <div className="flex items-center justify-between mb-2">
                                                  <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Drying Trends Over Time</h3>
                                              </div>
                                              <div className="h-64 w-full">
                                                  <ResponsiveContainer width="99%" height="100%">
                                                      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                                          <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                                          <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                                          <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                                          <Tooltip 
                                                              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                                                              itemStyle={{ fontWeight: 'bold' }}
                                                          />
                                                          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                                          <Line yAxisId="left" type="monotone" dataKey="Temp" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 5 }} name={`Temp (${tempUnit})`} />
                                                          <Line yAxisId="left" type="monotone" dataKey="RH" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} activeDot={{ r: 5 }} name="Relative Humidity (%)" />
                                                          <Line yAxisId="right" type="monotone" dataKey="AvgMoisture" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} name="Avg Moisture (%)" connectNulls />
                                                      </LineChart>
                                                  </ResponsiveContainer>
                                              </div>
                                              <p className="text-[10px] text-slate-500 uppercase tracking-widest text-center mt-2">Correlates Temp, RH, and average material moisture across recorded logs.</p>
                                          </div>
                                      )}

                                      {/* Equipment Suggestions */}
                                      <div className="bg-brand-blue/10 border border-brand-cyan/20 p-4 rounded-xl flex items-start gap-4 shadow-inner">
                                          <div className="bg-brand-cyan/20 p-2 rounded-lg text-brand-cyan shrink-0">
                                              <Wind size={20} />
                                          </div>
                                          <div>
                                              <h4 className="text-sm font-bold text-slate-200">Equipment Placement</h4>
                                              <p className="text-xs text-slate-400 mt-1">Based on this {isChamber ? 'chamber' : 'room'} {sqFt > 0 && `(approx. ${sqFt} sq.ft)`}, standard IICRC guidelines suggest {estimatedAirMovers > 0 ? `starting with ${estimatedAirMovers} air mover(s)` : '1 air mover for every 10-14 sq.ft.'} along floor/wall area. Size dehumidification based on water class and chamber cu.ft.</p>
                                          </div>
                                      </div>

                                      {/* Materials Dropdown Checklist Engine */}
                                      <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 space-y-6 relative">
                                          <div className="flex items-center justify-between">
                                              <h3 className="flex items-center space-x-2 text-sm font-bold uppercase tracking-widest text-slate-300">
                                                  <Droplets size={18} className="text-brand-cyan" /> <span>Tracked Materials</span>
                                              </h3>
                                              <div className="relative">
                                                  <button 
                                                      onClick={() => setIsMaterialChecklistOpen(!isMaterialChecklistOpen)}
                                                      className="bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center space-x-2 transition-all"
                                                  >
                                                      <Plus size={14} /> <span>Add New Material</span>
                                                  </button>

                                                  {isMaterialChecklistOpen && (
                                                      <div className="absolute right-0 top-full mt-2 w-72 bg-slate-800 border border-brand-cyan/40 rounded-xl shadow-2xl z-50 p-2 max-h-96 overflow-y-auto">
                                                          <div className="px-2 py-2 mb-2 border-b border-white/10 text-xs font-bold text-slate-400 uppercase tracking-widest">Material Checklist</div>
                                                          {BUILDING_MATERIALS.map(category => (
                                                              <div key={category.id} className="mb-4">
                                                                  <div className="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{category.name}</div>
                                                                  {category.items.map(item => {
                                                                      const isChecked = logData.newMaterialsToAdd.some(m => m.name === item.name && m.location === entityName);
                                                                      return (
                                                                          <button 
                                                                              key={item.name}
                                                                              onClick={() => handleChecklistToggle(item.name, entityName)}
                                                                              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-700 rounded-lg group transition-colors"
                                                                          >
                                                                              <span className="text-sm text-slate-300 font-medium truncate">{item.name}</span>
                                                                              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border ${isChecked ? 'bg-brand-cyan border-brand-cyan text-slate-900' : 'border-white/20'}`}>
                                                                                  {isChecked && <Check size={14} />}
                                                                              </div>
                                                                          </button>
                                                                      )
                                                                  })}
                                                              </div>
                                                          ))}
                                                      </div>
                                                  )}
                                              </div>
                                          </div>

                                          {/* Render Newly Selected Materials (Draft Mode) */}
                                          {newRoomMaterials.length > 0 && (
                                              <div className="space-y-3 bg-brand-cyan/5 p-4 rounded-xl border border-brand-cyan/20">
                                                  <div className="text-[10px] font-bold text-brand-cyan uppercase tracking-widest mb-2">Configure New Enrolled Materials</div>
                                                  {newRoomMaterials.map(mat => (
                                                      <div key={mat.id} className="flex flex-wrap md:flex-nowrap items-center gap-3 bg-black/40 p-3 rounded-lg border border-brand-cyan/10">
                                                          <div className="flex-1 min-w-[200px]">
                                                              <span className="text-sm font-bold text-white block">{mat.name}</span>
                                                              <span className="text-[10px] text-slate-500 uppercase">Will be saved to job</span>
                                                          </div>
                                                          <div className="flex items-center space-x-3 shrink-0">
                                                              <div className="space-y-1">
                                                                  <label className="text-[9px] text-slate-500 uppercase font-bold">Initial</label>
                                                                  <input type="number" placeholder="--" value={mat.reading} onChange={e => updateNewMaterial(mat.id, 'reading', e.target.value)} className="w-16 bg-slate-900 border border-white/10 rounded p-2 text-xs font-bold text-brand-cyan outline-none text-center" />
                                                              </div>
                                                              <div className="space-y-1">
                                                                  <label className="text-[9px] text-slate-500 uppercase font-bold">Goal</label>
                                                                  <input type="number" placeholder="12" value={mat.goal} onChange={e => updateNewMaterial(mat.id, 'goal', e.target.value)} className="w-16 bg-slate-900 border border-white/10 rounded p-2 text-xs font-bold text-white outline-none text-center" />
                                                              </div>
                                                              <button onClick={() => removeNewMaterial(mat.id)} className="mt-4 p-2 text-red-500/50 hover:text-red-400 bg-red-500/10 rounded transition-colors"><Trash2 size={16}/></button>
                                                          </div>
                                                      </div>
                                                  ))}
                                              </div>
                                          )}

                                          {/* Render Existing Tracked Materials */}
                                          {roomMaterials.length === 0 && newRoomMaterials.length === 0 ? (
                                              <div className="bg-black/20 p-6 rounded-xl text-center border-2 border-dashed border-white/5">
                                                  <Layers size={32} className="mx-auto text-slate-600 mb-3" />
                                                  <p className="text-sm text-slate-400">No materials currently tracked.<br/>Use the "Add New Material" checklist above to enroll readings.</p>
                                              </div>
                                          ) : (
                                              <div className="grid gap-3">
                                                  {roomMaterials.map((mat) => {
                                                      const alreadyRemoved = mat.status === 'Removed';
                                                      const isDemoed = alreadyRemoved || logData.demoed[mat.id]?.isDemoed || false;
                                                      const currentReading = mat.readings?.length > 0 ? mat.readings[mat.readings.length - 1].value : mat.initialReading;
                                                      
                                                      return (
                                                          <div key={mat.id} className="bg-black/30 border border-white/5 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                                                              <div className="flex-1">
                                                                  <div className={`text-sm font-bold text-slate-200 transition-all ${isDemoed ? 'line-through text-slate-500' : ''}`}>{mat.name}</div>
                                                                  <div className="text-[10px] text-slate-500 uppercase tracking-widest flex items-center space-x-2 mt-1">
                                                                      <span>Goal: {mat.dryGoal}%</span>
                                                                      <span>•</span>
                                                                      <span className={mat.status === 'Dry' ? 'text-emerald-400' : mat.status === 'Removed' ? 'text-red-400' : 'text-yellow-400'}>{mat.status}</span>
                                                                  </div>
                                                              </div>

                                                              <div className="flex items-center gap-4 shrink-0">
                                                                  {!alreadyRemoved && (
                                                                      <div className="flex flex-col items-end gap-2">
                                                                          <button
                                                                              onClick={() => {
                                                                                  setLogData(prev => ({
                                                                                      ...prev,
                                                                                      demoed: { ...prev.demoed, [mat.id]: { isDemoed: !prev.demoed[mat.id]?.isDemoed, quantity: prev.demoed[mat.id]?.quantity || '' } }
                                                                                  }))
                                                                              }}
                                                                              className={`text-[10px] font-bold uppercase px-3 py-2 rounded-lg transition-colors ${logData.demoed[mat.id]?.isDemoed ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                                                          >
                                                                              {logData.demoed[mat.id]?.isDemoed ? 'Undo Demo' : 'Mark Demolished'}
                                                                          </button>
                                                                          {logData.demoed[mat.id]?.isDemoed && (
                                                                              <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-4 duration-200">
                                                                                  <span className="text-[10px] font-bold text-slate-500 uppercase">Qty</span>
                                                                                  <input 
                                                                                      type="text"
                                                                                      placeholder="e.g. 15 sqft"
                                                                                      value={logData.demoed[mat.id].quantity}
                                                                                      onChange={e => setLogData(p => ({...p, demoed: {...p.demoed, [mat.id]: {...p.demoed[mat.id], quantity: e.target.value}}}))}
                                                                                      className="w-24 bg-slate-900 border border-red-500/30 rounded p-1.5 text-xs text-white outline-none focus:border-red-500 placeholder-slate-700 text-right"
                                                                                  />
                                                                              </div>
                                                                          )}
                                                                      </div>
                                                                  )}
                                                                  {alreadyRemoved && (
                                                                      <div className="flex flex-col items-end">
                                                                          <span className="text-[10px] font-bold uppercase px-3 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">Already Demoed</span>
                                                                          {mat.demoQuantity && <span className="text-xs text-slate-500 mt-1">{mat.demoQuantity} sqft</span>}
                                                                      </div>
                                                                  )}
                                                                  
                                                                  {!isDemoed && (
                                                                  <div className="flex items-center space-x-3 bg-slate-950 p-2 rounded-lg border border-white/10 ml-2">
                                                                      <div className="text-right">
                                                                          <p className="text-[9px] font-bold uppercase text-slate-500">Record Today</p>
                                                                      </div>
                                                                      <input 
                                                                          type="number" 
                                                                          value={logData.moisture[mat.id] || ''}
                                                                          onChange={e => setLogData(p => ({...p, moisture: {...p.moisture, [mat.id]: e.target.value}}))}
                                                                          className={`w-20 bg-slate-900 border-2 rounded text-center p-2 text-sm font-black outline-none transition-colors ${getMoistureColor(logData.moisture[mat.id], mat.dryGoal)}`}
                                                                          placeholder={currentReading?.toString() || '--'}
                                                                      />
                                                                  </div>
                                                                  )}
                                                              </div>
                                                          </div>
                                                      )
                                                  })}
                                              </div>
                                          )}
                                      </div>

                                      {/* Photos Component for Local Storage Uploads */}
                                      <div className="bg-slate-900 border border-white/5 rounded-[2rem] p-6 space-y-6">
                                          <div className="flex items-center justify-between">
                                              <h3 className="flex items-center space-x-2 text-sm font-bold uppercase tracking-widest text-slate-300">
                                                  <ImageIcon size={18} className="text-brand-cyan" /> <span>Room Photos & Support</span>
                                              </h3>
                                              <button 
                                                  onClick={() => fileInputRef.current?.click()}
                                                  className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center space-x-2 transition-all shadow-md"
                                              >
                                                  <Camera size={14} /> <span>Upload From Phone</span>
                                              </button>
                                          </div>
                                          
                                          <input 
                                              type="file" 
                                              multiple 
                                              accept="image/*" 
                                              ref={fileInputRef} 
                                              onChange={(e) => handlePhotoUpload(e, entityId)} 
                                              className="hidden" 
                                          />

                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                              {pendingPhotos.map((photo, idx) => (
                                                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden group bg-slate-800 border border-white/10">
                                                      <img src={photo.url} alt="Phone Upload" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                          <button 
                                                              onClick={() => setLogData(p => ({...p, photos: p.photos.filter(x => x.id !== photo.id)}))}
                                                              className="bg-red-500 text-white p-2 rounded-full hover:scale-110 active:scale-95 transition-all shadow-lg"
                                                          >
                                                              <Trash2 size={16} />
                                                          </button>
                                                      </div>
                                                  </div>
                                              ))}

                                              {pendingPhotos.length === 0 && (
                                                  <div 
                                                      onClick={() => fileInputRef.current?.click()}
                                                      className="col-span-2 md:col-span-4 aspect-[4/1] bg-black/20 rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-brand-cyan/50 hover:bg-brand-cyan/5 transition-all"
                                                  >
                                                      <div className="p-3 bg-white/5 rounded-full mb-3 text-brand-cyan"><Camera size={24} /></div>
                                                      <p className="text-sm font-bold text-slate-300">Tap to access local device photos</p>
                                                      <p className="text-[10px] uppercase tracking-widest text-slate-500 mt-1">Photos will be tied to {entityName}</p>
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                  </>
                              );
                          })()}
                      </div>
                  )}

              </div>
          </div>
      </div>

      {/* Chamber Creation Modal */}
      {isChamberModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
               <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                   <h3 className="text-lg font-black text-white mb-4">Combine Rooms into Chamber</h3>
                   <div className="space-y-4">
                       <div>
                           <label className="text-xs font-bold text-slate-500 uppercase">Chamber Name</label>
                           <input type="text" value={newChamberName} onChange={e => setNewChamberName(e.target.value)} placeholder="e.g. Master Suite Chamber" className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white outline-none mt-1" />
                       </div>
                       <div>
                           <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Select Rooms Configured</label>
                           <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                               {project.rooms?.map(r => (
                                   <label key={r.id} className="flex items-center space-x-3 bg-black/30 p-2 rounded border border-white/5 cursor-pointer hover:bg-black/50 transition-colors">
                                       <input type="checkbox" checked={selectedRoomsForChamber.includes(r.id)} onChange={e => {
                                           if (e.target.checked) setSelectedRoomsForChamber([...selectedRoomsForChamber, r.id]);
                                           else setSelectedRoomsForChamber(selectedRoomsForChamber.filter(id => id !== r.id));
                                       }} className="accent-brand-cyan w-4 h-4" />
                                       <span className="text-sm text-slate-300 font-medium">{r.name}</span>
                                   </label>
                               ))}
                           </div>
                       </div>
                   </div>
                   <div className="flex justify-end gap-3 mt-6">
                       <button onClick={() => setIsChamberModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white font-bold text-sm transition-colors">Cancel</button>
                       <button onClick={handleCreateChamber} disabled={!newChamberName || selectedRoomsForChamber.length === 0} className="px-5 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-900 font-black text-sm rounded-lg disabled:opacity-50 transition-colors uppercase tracking-widest">Create Chamber</button>
                   </div>
               </div>
          </div>
      )}
      {showPsychReport && (
          <ReportGenerator 
              reportType="psychrometric" 
              project={project} 
              onClose={() => setShowPsychReport(false)} 
          />
      )}
    </div>
  );
};

export default DryingLogs;
