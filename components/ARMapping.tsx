import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Map, Camera, Upload, X, MapPin, AlertTriangle, Thermometer, Box, Layers, MousePointer2, Save, Trash2, Palette, Check, ArrowRight, Power, PowerOff, Search, Settings, Eye, EyeOff, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Tag, Download, FileImage, FileCode2, Crosshair, PenTool, Maximize, Plus, Play, Gauge } from 'lucide-react';
import { Project, ARMarker, ARMappingData, ARArea, ARMeasurement, RoomScan } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { EventBus } from '../services/EventBus';
import WalkthroughViewer from './WalkthroughViewer';

interface ARMappingProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

const ARMapping: React.FC<ARMappingProps> = ({ project, onUpdate }) => {
  const [viewMode, setViewMode] = useState<'plan' | 'ar'>('plan');
  const [interactionMode, setInteractionMode] = useState<'select' | 'add_marker' | 'draw_area' | 'set_scale' | 'measure_distance'>('select');
  const [selectedMarker, setSelectedMarker] = useState<ARMarker | null>(null);
  const [selectedArea, setSelectedArea] = useState<ARArea | null>(null);
  const [currentAreaPoints, setCurrentAreaPoints] = useState<{ x: number; y: number }[]>([]);
  const [scalePoints, setScalePoints] = useState<{ x: number; y: number }[]>([]);
  const [measurementPoints, setMeasurementPoints] = useState<{ x: number; y: number }[]>([]);
  const [scaleDistance, setScaleDistance] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [draftAreaType, setDraftAreaType] = useState<'affected' | 'mitigated' | 'safe' | 'containment'>('affected');
  const [draftMarkerType, setDraftMarkerType] = useState<'equipment' | 'damage' | 'moisture' | 'note'>('note');
  const [isConfiguringMarker, setIsConfiguringMarker] = useState<{ x: number, y: number } | null>(null);
  const [isConfiguringArea, setIsConfiguringArea] = useState(false);
  const VISIBILITY_CACHE_KEY = 'ar-visibility-settings';
  const [visibility, setVisibility] = useState(() => {
    try {
      const cached = localStorage.getItem(VISIBILITY_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn('Failed to parse cached visibility', e);
    }
    return {
      markers: true,
      areas: true,
      measurements: true,
      boundingBox: false
    };
  });

  useEffect(() => {
    localStorage.setItem(VISIBILITY_CACHE_KEY, JSON.stringify(visibility));
  }, [visibility]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [sidebarTab, setSidebarTab] = useState<'inventory' | 'walkthroughs' | 'ai-capture'>('inventory');
  const [arThreshold, setArThreshold] = useState(85);
  const [draggingItem, setDraggingItem] = useState<{ type: 'marker' | 'area' | 'area_point' | 'current_area_point', id: string, pointIndex?: number, lastX?: number, lastY?: number, initialPoints?: {x: number, y: number}[] } | null>(null);
  const [selectedWalkthrough, setSelectedWalkthrough] = useState<RoomScan | null>(null);
  const [photoPickerFor, setPhotoPickerFor] = useState<{type: 'marker' | 'area', id: string} | null>(null);

  // New AR Simulation State
  const [featurePoints, setFeaturePoints] = useState<{ id: string; x: number; y: number; wx: string; wz: string; opacity: number }[]>([]);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [currentZone, setCurrentZone] = useState('Entryway');
  const CACHE_KEY = `ar-scan-photos-${project.id}`;
  const [capturedPhotos, setCapturedPhotos] = useState<{ id: string; zone: string; timestamp: number; url?: string }[]>(() => {
      try {
          const cached = localStorage.getItem(CACHE_KEY);
          if (cached) return JSON.parse(cached);
      } catch (error) {
          console.warn('Failed to parse cached photos', error);
      }
      return [];
  });

  useEffect(() => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(capturedPhotos));
  }, [capturedPhotos, CACHE_KEY]);
  
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localARData] = useState<ARMappingData | null>(null);

  useEffect(() => {
    // Attempt to load from localStorage as fallback for sessions
    const savedSession = localStorage.getItem(`ar-session-${project.id}`);
    if (savedSession && !project.arMapping) {
      try {
        const parsed = JSON.parse(savedSession);
        onUpdate({ arMapping: parsed });
      } catch (e) {
        console.error('Failed to parse AR session', e);
      }
    }
  }, [project.id, project.arMapping, onUpdate]);

  const arData: ARMappingData = React.useMemo(() => project.arMapping || localARData || { markers: [], areas: [], measurements: [] }, [project.arMapping, localARData]);

  useEffect(() => {
    // Save to localStorage whenever it updates to persist across browser sessions immediately
    if (arData && (arData.markers?.length > 0 || arData.areas?.length > 0 || arData.measurements?.length > 0)) {
      localStorage.setItem(`ar-session-${project.id}`, JSON.stringify(arData));
    }
  }, [arData, project.id]);

  const markers = React.useMemo(() => arData.markers || [], [arData]);
  const areas = React.useMemo(() => arData.areas || [], [arData]);
  const measurements = React.useMemo(() => arData.measurements || [], [arData]);

  // Simulated Physics for AR Objects
  const physicsVelocities = useRef<{ [id: string]: { vx: number, vy: number } }>({});
  const lastPhysicsTime = useRef<number>(performance.now());
  
  useEffect(() => {
    if (viewMode !== 'ar') return;

    let animationFrameId: number;
    const physicsLoop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastPhysicsTime.current) / 1000, 0.1); // constrain dt
      lastPhysicsTime.current = now;

      if (markers.length > 0) {
        let hasChanges = false;
        const newMarkers = [...markers];

        // Apply basic physics: soft gravity towards center Y if they're "floating" (just an example), 
        // but simple collision detection is more realistic to prevent overlapping AR labels.
        for (let i = 0; i < newMarkers.length; i++) {
          const m1 = newMarkers[i];
          if (draggingItem?.id === m1.id) continue;

          if (!physicsVelocities.current[m1.id]) {
            physicsVelocities.current[m1.id] = { vx: 0, vy: 0 };
          }
          const vel = physicsVelocities.current[m1.id];

          // Collision detection with other markers
          for (let j = i + 1; j < newMarkers.length; j++) {
            const m2 = newMarkers[j];
            if (draggingItem?.id === m2.id) continue;

            const dx = m2.x - m1.x;
            const dy = m2.y - m1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const minDistance = 14; // ~14% of screen minimum distance between AR object centers
            if (dist < minDistance && dist > 0) {
              const overlap = minDistance - dist;
              const pushX = (dx / dist) * overlap * 12.0 * dt; // force multiplier
              const pushY = (dy / dist) * overlap * 12.0 * dt;

              vel.vx -= pushX;
              vel.vy -= pushY;
              
              if (!physicsVelocities.current[m2.id]) physicsVelocities.current[m2.id] = { vx: 0, vy: 0 };
              physicsVelocities.current[m2.id].vx += pushX;
              physicsVelocities.current[m2.id].vy += pushY;
            }
          }

          // Friction
          vel.vx *= 0.65;
          vel.vy *= 0.65;

          // Velocity applied to position
          if (Math.abs(vel.vx) > 0.05 || Math.abs(vel.vy) > 0.05) {
            newMarkers[i] = {
              ...m1,
              x: Math.max(2, Math.min(98, m1.x + vel.vx)),
              y: Math.max(2, Math.min(98, m1.y + vel.vy))
            };
            hasChanges = true;
          }
        }

        if (hasChanges) {
          onUpdate({
            arMapping: {
              ...arData,
              markers: newMarkers
            }
          });
        }
      }

      animationFrameId = requestAnimationFrame(physicsLoop);
    };

    lastPhysicsTime.current = performance.now();
    physicsLoop();

    return () => cancelAnimationFrame(animationFrameId);
  }, [viewMode, markers, draggingItem, onUpdate, arData]);

  // Simulated AR Tracking
  useEffect(() => {
    if (viewMode === 'ar') {
      const interval = setInterval(() => {
         const newPoints = Array.from({ length: 12 }).map((_, i) => ({
             id: `fp-${Date.now()}-${i}`,
             x: 10 + Math.random() * 80, 
             y: 20 + Math.random() * 60,
             wx: (Math.random() * 8 - 4).toFixed(2),
             wz: (Math.random() * 8 + 1).toFixed(2),
             opacity: Math.random() * 0.6 + 0.2
         }));
         setFeaturePoints(newPoints);

         const zones = ['Entryway', 'Living Room', 'Hallway', 'Kitchen', 'Bathroom'];
         const simZone = zones[Math.floor(Date.now() / 8000) % zones.length];
         if (simZone !== currentZone) {
             setCurrentZone(simZone);
         }
      }, 800);
      return () => clearInterval(interval);
    }
  }, [viewMode, currentZone]);

  const currentZoneRef = useRef(currentZone);
  useEffect(() => { currentZoneRef.current = currentZone; }, [currentZone]);

  const panStartRef = useRef<{ x: number } | null>(null);
  const simulatedPanRef = useRef(0);
  const lastCapturePanRef = useRef(0);

  // Auto Capture Logic
  useEffect(() => {
    if (!autoCaptureEnabled || viewMode !== 'ar') return;

    let frameId: number;
    let deviceAlpha = 0;
    
    const handleOrientation = (e: DeviceOrientationEvent) => {
        if (e.alpha !== null) {
            deviceAlpha = e.alpha;
        }
    };
    window.addEventListener('deviceorientation', handleOrientation);

    const capture = () => {
         const z = currentZoneRef.current;
         const url = webcamRef.current?.getScreenshot() || undefined;
         setCapturedPhotos(prev => [...prev, { id: `photo-${Date.now()}`, zone: z, timestamp: Date.now(), url }]);
         EventBus.publish('com.restorationai.capture', { zone: z }, undefined, `Auto-captured photo for ${z}`, 'success');
         // update the checkpoint for the next pan calculation
         lastCapturePanRef.current = Math.abs(simulatedPanRef.current) + deviceAlpha;
         simulatedPanRef.current = 0; // reset horizontal drag offset
    };
    
    // Initial capture
    capture();

    let lastDeviceAlpha = 0;
    let accumulatedAlpha = 0;

    const checkPan = () => {
        // Evaluate physical device rotation
        let alphaDiff = deviceAlpha - lastDeviceAlpha;
        if (alphaDiff > 180) alphaDiff -= 360;
        if (alphaDiff < -180) alphaDiff += 360;
        accumulatedAlpha += Math.abs(alphaDiff);
        lastDeviceAlpha = deviceAlpha;

        // Trigger capture if camera pans 90 degrees physically OR dragged left/right 25% screen width
        if (accumulatedAlpha >= 90 || Math.abs(simulatedPanRef.current) >= 25) {
            capture();
            accumulatedAlpha = 0;
            simulatedPanRef.current = 0;
        }

        frameId = requestAnimationFrame(checkPan);
    };
    
    // Short delay before activating pan listeners
    setTimeout(() => {
        frameId = requestAnimationFrame(checkPan);
    }, 500);

    return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
        cancelAnimationFrame(frameId);
    };
  }, [autoCaptureEnabled, viewMode]);

  const manualCapture = () => {
    const url = webcamRef.current?.getScreenshot() || undefined;
    const newId = `photo-${Date.now()}`;
    setCapturedPhotos(prev => [...prev, { id: newId, zone: currentZone, timestamp: Date.now(), url }]);
    EventBus.publish('com.restorationai.capture', { zone: currentZone }, undefined, `Manual snapshot taken`, 'success');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onUpdate({
          arMapping: {
            ...arData,
            sitePlanUrl: reader.result as string
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    // We only create objects on click if we are not dragging
    if (draggingItem) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 100;
    const height = rect.height || 100;
    const x = ((e.clientX - rect.left) / width) * 100;
    const y = ((e.clientY - rect.top) / height) * 100;

    if (interactionMode === 'add_marker') {
      setIsConfiguringMarker({ x, y });
    } else if (interactionMode === 'draw_area') {
      setCurrentAreaPoints([...currentAreaPoints, { x, y }]);
    } else if (interactionMode === 'set_scale') {
      if (scalePoints.length < 2) {
        setScalePoints([...scalePoints, { x, y }]);
      }
    } else if (interactionMode === 'measure_distance') {
      if (!arData.scale) {
        alert("Please set the scale first.");
        setInteractionMode('select');
        return;
      }
      if (measurementPoints.length < 2) {
        const newPoints = [...measurementPoints, { x, y }];
        setMeasurementPoints(newPoints);
        if (newPoints.length === 2) {
          const distPct = Math.sqrt(Math.pow(newPoints[1].x - newPoints[0].x, 2) + Math.pow(newPoints[1].y - newPoints[0].y, 2));
          const distance = parseFloat((distPct / arData.scale).toFixed(1));
          const newMeasurement: ARMeasurement = {
            id: `measure-${Date.now()}`,
            p1: newPoints[0],
            p2: newPoints[1],
            distance
          };
          onUpdate({
            arMapping: {
              ...arData,
              measurements: [...measurements, newMeasurement]
            }
          });
          setMeasurementPoints([]);
        }
      }
    }
  };

  const handlePointerDownContainer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 100;
    const panStartPct = ((e.clientX - rect.left) / width) * 100;
    panStartRef.current = { x: panStartPct };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 100;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / width) * 100));

    if (viewMode === 'ar' && autoCaptureEnabled && !draggingItem && panStartRef.current) {
        simulatedPanRef.current += (x - panStartRef.current.x);
        panStartRef.current.x = x;
    }

    if (!draggingItem) return;
    const rectMove = e.currentTarget.getBoundingClientRect();
    const heightMove = rectMove.height || 100;
    const y = Math.max(0, Math.min(100, ((e.clientY - rectMove.top) / heightMove) * 100));

    if (draggingItem.type === 'marker') {
      updateMarker(draggingItem.id, { x, y });
    } else if (draggingItem.type === 'area' && draggingItem.lastX !== undefined && draggingItem.lastY !== undefined && draggingItem.initialPoints) {
      const dx = x - draggingItem.lastX;
      const dy = y - draggingItem.lastY;
      const newPoints = draggingItem.initialPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
      updateArea(draggingItem.id, { points: newPoints });
    } else if (draggingItem.type === 'area_point' && draggingItem.pointIndex !== undefined) {
       const areaToUpdate = areas.find(a => a.id === draggingItem.id);
       if(areaToUpdate) {
         const newPoints = [...areaToUpdate.points];
         newPoints[draggingItem.pointIndex] = { x, y };
         updateArea(draggingItem.id, { points: newPoints });
       }
    } else if (draggingItem.type === 'current_area_point' && draggingItem.pointIndex !== undefined) {
       const newPoints = [...currentAreaPoints];
       newPoints[draggingItem.pointIndex] = { x, y };
       setCurrentAreaPoints(newPoints);
    }
  };

  const handlePointerUp = () => {
    setDraggingItem(null);
    panStartRef.current = null;
  };

  const saveScale = () => {
    if (scalePoints.length !== 2) return;
    const dx = scalePoints[1].x - scalePoints[0].x;
    const dy = scalePoints[1].y - scalePoints[0].y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const newScale = pixelDist / scaleDistance; // pixels per foot

    const updatedAreas = areas.map(a => ({
      ...a,
      sqFeet: calculateAreaSqFeet(a.points, newScale)
    }));

    const updatedMeasurements = measurements.map(m => {
       const distPct = Math.sqrt(Math.pow(m.p2.x - m.p1.x, 2) + Math.pow(m.p2.y - m.p1.y, 2));
       return {
         ...m,
         distance: parseFloat((distPct / newScale).toFixed(1))
       };
    });

    onUpdate({
      arMapping: {
        ...arData,
        scale: newScale,
        areas: updatedAreas,
        measurements: updatedMeasurements
      }
    });
    setScalePoints([]);
    setInteractionMode('select');
  };

  const saveArea = () => {
    if (currentAreaPoints.length < 3) {
      alert("An area needs at least 3 points.");
      return;
    }
    setIsConfiguringArea(true);
  };

  const calculateAreaSqFeet = (points: {x:number, y:number}[], scale: number) => {
    let areaPercentageSq = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      areaPercentageSq += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    const sqPercent = Math.abs(areaPercentageSq / 2);
    return Math.round(sqPercent / (scale * scale));
  };

  const confirmArea = () => {
    const colorMap = {
      'affected': '#ef4444',
      'mitigated': '#22c55e',
      'safe': '#3b82f6',
      'containment': '#eab308'
    };
    
    let sqFeet;
    if (arData.scale) {
      sqFeet = calculateAreaSqFeet(currentAreaPoints, arData.scale);
    }
    
    const newArea: ARArea = {
      id: `area-${Date.now()}`,
      points: currentAreaPoints,
      label: draftAreaType.charAt(0).toUpperCase() + draftAreaType.slice(1) + ' Area',
      type: draftAreaType as 'affected' | 'mitigated' | 'safe',
      color: colorMap[draftAreaType] || '#ef4444',
      timestamp: Date.now(),
      sqFeet
    };

    onUpdate({
      arMapping: {
        ...arData,
        areas: [...areas, newArea]
      }
    });
    setCurrentAreaPoints([]);
    setInteractionMode('select');
    setSelectedArea(newArea);
    setSelectedMarker(null);
    setIsConfiguringArea(false);
  };

  const confirmMarker = () => {
    if (!isConfiguringMarker) return;
    const newMarker: ARMarker = {
      id: `marker-${Date.now()}`,
      x: isConfiguringMarker.x,
      y: isConfiguringMarker.y,
      label: draftMarkerType.charAt(0).toUpperCase() + draftMarkerType.slice(1),
      type: draftMarkerType,
      timestamp: Date.now()
    };

    onUpdate({
      arMapping: {
        ...arData,
        markers: [...markers, newMarker]
      }
    });
    setInteractionMode('select');
    setSelectedMarker(newMarker);
    setSelectedArea(null);
    setIsConfiguringMarker(null);
  };

  const updateMarker = (id: string, updates: Partial<ARMarker>) => {
    const updatedMarkers = markers.map(m => 
      m.id === id ? { ...m, ...updates } : m
    );
    onUpdate({
      arMapping: {
        ...arData,
        markers: updatedMarkers
      }
    });
    if (selectedMarker?.id === id) {
      setSelectedMarker({ ...selectedMarker, ...updates } as ARMarker);
    }
  };

  const deleteMarker = (id: string) => {
    const updatedMarkers = markers.filter(m => m.id !== id);
    onUpdate({
      arMapping: {
        ...arData,
        markers: updatedMarkers
      }
    });
    setSelectedMarker(null);
  };

  const updateArea = (id: string, updates: Partial<ARArea>) => {
    const updatedAreas = areas.map(a => {
      if (a.id === id) {
        const newA = { ...a, ...updates };
        if (updates.points && arData.scale) {
          newA.sqFeet = calculateAreaSqFeet(updates.points, arData.scale);
        }
        return newA;
      }
      return a;
    });
    onUpdate({
      arMapping: {
        ...arData,
        areas: updatedAreas
      }
    });
    if (selectedArea?.id === id) {
      const newSel = { ...selectedArea, ...updates };
      if (updates.points && arData.scale) {
        newSel.sqFeet = calculateAreaSqFeet(updates.points, arData.scale);
      }
      setSelectedArea(newSel as ARArea);
    }
  };

  const deleteArea = (id: string) => {
    const updatedAreas = areas.filter(a => a.id !== id);
    onUpdate({
      arMapping: {
        ...arData,
        areas: updatedAreas
      }
    });
    setSelectedArea(null);
  };

  const suggestTags = async (item: ARMarker | ARArea, isMarker: boolean) => {
    setIsSuggestingTags(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = isMarker 
        ? `Suggest 3-5 relevant tags for an AR marker with label "${item.label}" and type "${(item as ARMarker).type}". Return as JSON array of strings.`
        : `Suggest 3-5 relevant tags for an AR area with label "${item.label}" and type "${(item as ARArea).type}". Return as JSON array of strings.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      
      let suggestedTags: string[] = [];
      try {
        suggestedTags = JSON.parse(response.text || '[]');
      } catch (parseError) {
        console.error("Failed to parse tags:", parseError);
        suggestedTags = [];
      }
      if (suggestedTags && Array.isArray(suggestedTags)) {
        const currentTags = item.tags || [];
        const newTags = [...new Set([...currentTags, ...suggestedTags])];
        
        if (isMarker) {
          updateMarker(item.id, { tags: newTags });
          setSelectedMarker({ ...item, tags: newTags } as ARMarker);
        } else {
          updateArea(item.id, { tags: newTags });
          setSelectedArea({ ...item, tags: newTags } as ARArea);
        }
      }
    } catch (error) {
      console.error("Error suggesting tags:", error);
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const movePointUp = (index: number) => {
    if (index === 0 || !selectedArea) return;
    const newPoints = [...selectedArea.points];
    [newPoints[index - 1], newPoints[index]] = [newPoints[index], newPoints[index - 1]];
    updateArea(selectedArea.id, { points: newPoints });
  };

  const movePointDown = (index: number) => {
    if (!selectedArea || index === selectedArea.points.length - 1) return;
    const newPoints = [...selectedArea.points];
    [newPoints[index], newPoints[index + 1]] = [newPoints[index + 1], newPoints[index]];
    updateArea(selectedArea.id, { points: newPoints });
  };

  const removePoint = (index: number) => {
    if (!selectedArea || selectedArea.points.length <= 3) return;
    const newPoints = selectedArea.points.filter((_, i) => i !== index);
    updateArea(selectedArea.id, { points: newPoints });
  };

  const markerIconMap: Record<string, React.ReactNode> = {
    equipment: <Box size={16} />,
    damage: <AlertTriangle size={16} />,
    moisture: <Thermometer size={16} />,
    note: <MapPin size={16} />
  };

  const getMarkerIcon = (type: ARMarker['type']) => {
    return markerIconMap[type] || <MapPin size={16} />;
  };

  const polygonPoints = (points: { x: number; y: number }[]) => {
    return points.map(p => `${p.x},${p.y}`).join(' ');
  };

  const getBoundingBox = () => {
    if (markers.length === 0 && areas.length === 0) return null;
    let minX = 100, minY = 100, maxX = 0, maxY = 0;
    
    markers.forEach(m => {
      if (m.x < minX) minX = m.x;
      if (m.x > maxX) maxX = m.x;
      if (m.y < minY) minY = m.y;
      if (m.y > maxY) maxY = m.y;
    });

    areas.forEach(a => {
      a.points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    });

    // Add some padding
    minX = Math.max(0, minX - 5);
    minY = Math.max(0, minY - 5);
    maxX = Math.min(100, maxX + 5);
    maxY = Math.min(100, maxY + 5);

    return { minX, minY, maxX, maxY };
  };

  const filteredMarkers = markers.filter(m => m.label.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredAreas = areas.filter(a => a.label.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleExport = (format: 'pdf' | 'jpg' | 'dxf' | 'esx') => {
    setShowExportMenu(false);
    EventBus.publish('com.restorationai.export', { format, project: project.id }, project.id, `Exporting Site Plan as ${format.toUpperCase()}...`, 'info');
    
    // Simulate export delay
    setTimeout(() => {
        EventBus.publish('com.restorationai.export.complete', { format, project: project.id }, project.id, `Site Plan ${format.toUpperCase()} Export Complete`, 'success');
        alert(`Simulated export of Site Plan as ${format.toUpperCase()}`);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-900 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5 mr-4">
            <button 
              onClick={() => setViewMode('plan')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${viewMode === 'plan' ? 'bg-brand-cyan text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              <Map size={18} />
              <span className="text-xs">Site Plan</span>
            </button>
            <button 
              onClick={() => setViewMode('ar')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${viewMode === 'ar' ? 'bg-brand-cyan text-slate-900 font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              <Camera size={18} />
              <span className="text-xs">AR View</span>
            </button>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5 relative">
            <button 
              onClick={() => { setInteractionMode('select'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${interactionMode === 'select' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
              title="Select objects"
            >
              <MousePointer2 size={18} />
              {interactionMode === 'select' && <span className="text-xs font-bold uppercase tracking-widest hidden lg:inline">Select</span>}
            </button>
            <button 
              onClick={() => { setInteractionMode('add_marker'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${interactionMode === 'add_marker' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
              title="Place marker"
            >
              <Crosshair size={18} />
              {interactionMode === 'add_marker' && <span className="text-xs font-bold uppercase tracking-widest hidden lg:inline">Point</span>}
            </button>
            <button 
              onClick={() => { setInteractionMode('draw_area'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${interactionMode === 'draw_area' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
              title="Draw area polygon"
            >
              <PenTool size={18} />
              {interactionMode === 'draw_area' && <span className="text-xs font-bold uppercase tracking-widest hidden lg:inline">Area</span>}
            </button>
            <button 
              onClick={() => { setInteractionMode('set_scale'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${interactionMode === 'set_scale' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
              title="Set measuring scale"
            >
              <Maximize size={18} />
              {interactionMode === 'set_scale' && <span className="text-xs font-bold uppercase tracking-widest hidden lg:inline">Scale</span>}
            </button>
            <button 
              onClick={() => { setInteractionMode('measure_distance'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${interactionMode === 'measure_distance' ? 'bg-white/10 text-brand-cyan' : 'text-slate-500 hover:text-slate-300'}`}
              title="Measure distance"
            >
              <Layers size={18} />
              {interactionMode === 'measure_distance' && <span className="text-xs font-bold uppercase tracking-widest hidden lg:inline">Measure</span>}
            </button>
            
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`p-2 rounded-lg transition-all ${showExportMenu ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-slate-500 hover:text-white'}`}
              title="Export Site Plan"
            >
              <Download size={18} />
            </button>

            {showExportMenu && (
                 <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                     <div className="p-2 border-b border-white/10">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Visual Image</span>
                         <button onClick={() => handleExport('pdf')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center mt-1"><FileImage size={14} className="mr-2 text-brand-cyan"/> PDF Document</button>
                         <button onClick={() => handleExport('jpg')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center"><FileImage size={14} className="mr-2 text-brand-cyan"/> JPG Image</button>
                     </div>
                     <div className="p-2">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Data Export</span>
                         <button onClick={() => handleExport('dxf')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center mt-1"><FileCode2 size={14} className="mr-2 text-emerald-400"/> AutoCAD (DXF)</button>
                         <button onClick={() => handleExport('esx')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center"><FileCode2 size={14} className="mr-2 text-emerald-400"/> Xactimate (ESX)</button>
                     </div>
                 </div>
             )}
          </div>
          
          {interactionMode === 'draw_area' && currentAreaPoints.length > 0 && (
            <div className="flex items-center space-x-2 ml-4">
              <button 
                onClick={saveArea}
                className="px-3 py-1.5 bg-green-500 text-slate-900 rounded-lg text-[10px] font-black uppercase flex items-center space-x-1"
              >
                <Save size={12} />
                <span>Save Area</span>
              </button>
              <button 
                onClick={() => setCurrentAreaPoints([])}
                className="px-3 py-1.5 bg-white/5 text-slate-400 rounded-lg text-[10px] font-black uppercase"
              >
                Clear
              </button>
            </div>
          )}

          {interactionMode === 'set_scale' && (
            <div className="flex items-center space-x-2 ml-4">
              {scalePoints.length === 2 ? (
                <>
                  <input 
                    type="number" 
                    value={scaleDistance}
                    onChange={(e) => setScaleDistance(Number(e.target.value))}
                    className="w-16 bg-slate-950 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                  />
                  <span className="text-[10px] text-slate-400 font-bold uppercase">ft</span>
                  <button 
                    onClick={saveScale}
                    className="px-3 py-1.5 bg-brand-cyan text-slate-900 rounded-lg text-[10px] font-black uppercase flex items-center space-x-1"
                  >
                    <Check size={12} />
                    <span>Confirm Scale</span>
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-brand-cyan font-bold uppercase animate-pulse">
                  {scalePoints.length === 0 ? 'Click first point' : 'Click second point'}
                </span>
              )}
              <button 
                onClick={() => { setScalePoints([]); setInteractionMode('select'); }}
                className="px-3 py-1.5 bg-white/5 text-slate-400 rounded-lg text-[10px] font-black uppercase"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="AR Settings"
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Upload Site Plan"
          >
            <Upload size={20} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex">
        {/* Left Side: Viewport */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {viewMode === 'plan' ? (
            <div 
              className={`relative max-w-full max-h-full ${interactionMode !== 'select' ? 'cursor-crosshair' : 'cursor-default'}`}
              onClick={handleInteraction}
              onPointerDown={handlePointerDownContainer}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {arData.sitePlanUrl ? (
                <img 
                  src={arData.sitePlanUrl} 
                  alt="Site Plan" 
                  className="max-w-full max-h-full object-contain opacity-80"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-slate-500 border-2 border-dashed border-white/10 rounded-2xl">
                  <Map size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">No site plan uploaded</p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 bg-brand-cyan text-slate-900 rounded-lg font-bold text-xs"
                  >
                    Upload Plan
                  </button>
                </div>
              )}

              {/* SVG Layer for Areas */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {visibility.areas && areas.map(area => {
                  const cx = area.points.reduce((sum, p) => sum + p.x, 0) / area.points.length;
                  const cy = area.points.reduce((sum, p) => sum + p.y, 0) / area.points.length;
                  
                  return (
                  <g key={area.id}>
                    <polygon 
                      points={polygonPoints(area.points)}
                      fill={area.color}
                      fillOpacity={selectedArea?.id === area.id ? 0.6 : 0.2}
                      stroke={selectedArea?.id === area.id ? '#ffffff' : area.color}
                      strokeWidth={selectedArea?.id === area.id ? "1" : "0.5"}
                      className={`cursor-pointer pointer-events-auto transition-all ${selectedArea?.id === area.id ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArea(area);
                        setSelectedMarker(null);
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const svgElem = e.currentTarget.parentElement?.parentElement;
                        if(svgElem) {
                          const rect = svgElem.getBoundingClientRect();
                          const startX = ((e.clientX - rect.left) / rect.width) * 100;
                          const startY = ((e.clientY - rect.top) / rect.height) * 100;
                          setDraggingItem({ type: 'area', id: area.id, lastX: startX, lastY: startY, initialPoints: [...area.points] });
                        }
                        setSelectedArea(area);
                        setSelectedMarker(null);
                      }}
                    />
                    {(area.sqFeet || area.linearFeet) && (
                      <text x={cx} y={cy} fontSize="2" fill="#ffffff" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" className="pointer-events-none drop-shadow-md font-mono">
                          {area.sqFeet ? `${area.sqFeet} SF` : ''} {area.sqFeet && area.linearFeet ? '|' : ''} {area.linearFeet ? `${area.linearFeet} LF` : ''}
                      </text>
                    )}
                  </g>
                )})}
                
                {/* Draggable vertices for selected area */}
                {visibility.areas && selectedArea && (
                  <g>
                    {selectedArea.points.map((p, i) => {
                      const nextIndex = (i + 1) % selectedArea.points.length;
                      const nextP = selectedArea.points[nextIndex];
                      const midX = (p.x + nextP.x) / 2;
                      const midY = (p.y + nextP.y) / 2;

                      return (
                        <React.Fragment key={`plan-edge-${selectedArea.id}-${i}`}>
                          <circle 
                            cx={p.x} 
                            cy={p.y} 
                            r="1.5"
                            fill="#ffffff"
                            stroke={selectedArea.color}
                            strokeWidth="0.5"
                            className="cursor-move pointer-events-auto hover:scale-150 transition-transform"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              setDraggingItem({ type: 'area_point', id: selectedArea.id, pointIndex: i });
                            }}
                          />
                          <circle 
                            cx={midX} 
                            cy={midY} 
                            r="1"
                            fill="#ffffff"
                            fillOpacity="0.5"
                            stroke={selectedArea.color}
                            strokeWidth="0.5"
                            className="cursor-pointer pointer-events-auto hover:r-[1.5] hover:fill-opacity-100 transition-all"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              const newPoints = [...selectedArea.points];
                              newPoints.splice(nextIndex, 0, { x: midX, y: midY });
                              updateArea(selectedArea.id, { points: newPoints });
                              setDraggingItem({ type: 'area_point', id: selectedArea.id, pointIndex: nextIndex });
                            }}
                          />
                        </React.Fragment>
                      );
                    })}
                  </g>
                )}

                {interactionMode === 'draw_area' && currentAreaPoints.length > 0 && (
                  <>
                    <polyline 
                      points={polygonPoints(currentAreaPoints)}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="0.5"
                      strokeDasharray="1,1"
                    />
                    {currentAreaPoints.map((p, i) => (
                      <circle 
                        key={i} 
                        cx={p.x} 
                        cy={p.y} 
                        r="1.5" 
                        fill="#06b6d4" 
                        className="cursor-move pointer-events-auto hover:scale-150 transition-transform"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingItem({ type: 'current_area_point', id: 'current', pointIndex: i });
                        }}
                      />
                    ))}
                  </>
                )}
                {visibility.boundingBox && (() => {
                  const bbox = getBoundingBox();
                  if (!bbox) return null;
                  return (
                    <rect 
                      x={bbox.minX} 
                      y={bbox.minY} 
                      width={bbox.maxX - bbox.minX} 
                      height={bbox.maxY - bbox.minY} 
                      fill="none" 
                      stroke="#06b6d4" 
                      strokeWidth="0.5" 
                      strokeDasharray="2,2" 
                    />
                  );
                })()}
                {interactionMode === 'set_scale' && scalePoints.length > 0 && (
                  <>
                    {scalePoints.length === 2 && (
                      <line 
                        x1={scalePoints[0].x} 
                        y1={scalePoints[0].y} 
                        x2={scalePoints[1].x} 
                        y2={scalePoints[1].y} 
                        stroke="#06b6d4" 
                        strokeWidth="0.5" 
                      />
                    )}
                    {scalePoints.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r="1" fill="#06b6d4" />
                    ))}
                  </>
                )}

                {/* Measurements Rendering Phase */}
                {visibility.measurements && measurements.map(m => (
                  <g key={m.id}>
                    <line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="1,1" />
                    <circle cx={m.p1.x} cy={m.p1.y} r="0.8" fill="#f59e0b" />
                    <circle cx={m.p2.x} cy={m.p2.y} r="0.8" fill="#f59e0b" />
                    <text x={(m.p1.x + m.p2.x)/2} y={(m.p1.y + m.p2.y)/2} fontSize="2" fill="#ffffff" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" className="pointer-events-none drop-shadow-md font-mono" dy="-2">
                      {m.distance} ft
                    </text>
                    {/* Delete button (invisible rect covering text area) */}
                    <circle cx={(m.p1.x + m.p2.x)/2} cy={(m.p1.y + m.p2.y)/2 + 2} r="1.5" fill="red" fillOpacity="0.8" className="cursor-pointer pointer-events-auto hover:fill-opacity-100 transition-all" 
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdate({
                          arMapping: {
                            ...arData,
                            measurements: measurements.filter(meas => meas.id !== m.id)
                          }
                        });
                      }}
                    />
                    <text x={(m.p1.x + m.p2.x)/2} y={(m.p1.y + m.p2.y)/2 + 2} fontSize="1.5" fill="white" textAnchor="middle" dominantBaseline="middle" className="pointer-events-none font-bold">
                       X
                    </text>
                  </g>
                ))}
                
                {interactionMode === 'measure_distance' && measurementPoints.length === 1 && (
                   <circle cx={measurementPoints[0].x} cy={measurementPoints[0].y} r="1" fill="#f59e0b" />
                )}
              </svg>

              {/* Markers on Plan */}
              {visibility.markers && markers.map(marker => (
                <div 
                  key={marker.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMarker(marker);
                    setSelectedArea(null);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedMarker(marker);
                    setSelectedArea(null);
                    setDraggingItem({ type: 'marker', id: marker.id });
                  }}
                  className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full flex items-center justify-center cursor-pointer transition-shadow ${selectedMarker?.id === marker.id ? 'scale-125 shadow-lg' : 'border border-white/20 hover:scale-110'}`}
                  style={{ 
                    left: `${marker.x}%`, 
                    top: `${marker.y}%`,
                    backgroundColor: selectedMarker?.id === marker.id ? (marker.color || '#06b6d4') : (marker.color ? `${marker.color}cc` : 'rgba(30, 41, 59, 0.8)'),
                    color: selectedMarker?.id === marker.id ? '#0f172a' : '#ffffff',
                    boxShadow: selectedMarker?.id === marker.id ? `0 0 15px ${marker.color || '#06b6d4'}80` : 'none'
                  }}
                >
                  {getMarkerIcon(marker.type)}
                </div>
              ))}

              {interactionMode !== 'select' && (
                <div className="absolute top-4 left-4 bg-brand-cyan text-slate-900 px-3 py-1 rounded-full text-[10px] font-black uppercase animate-pulse pointer-events-none">
                  {interactionMode === 'add_marker' ? 'Tap Screen to Place Marker' : interactionMode === 'set_scale' ? 'Click two points to set scale' : 'Tap Screen to Map Area Points'}
                </div>
              )}

              {arData.scale && viewMode === 'plan' && (
                <div className="absolute bottom-4 left-4 pointer-events-none w-[calc(100%-2rem)]">
                  <div className="text-[10px] text-slate-400 font-bold mb-1 bg-slate-900/80 px-2 py-0.5 rounded inline-block shadow-lg border border-white/10">10 ft</div>
                  <div className="h-1.5 bg-brand-cyan rounded-full shadow-[0_0_8px_rgba(6,182,212,0.8)]" style={{ width: `${arData.scale * 10}%` }} />
                </div>
              )}
            </div>
          ) : (
            <div 
              className={`w-full h-full relative overflow-hidden ${interactionMode !== 'select' ? 'cursor-crosshair' : 'cursor-default'}`} 
              onClick={handleInteraction}
              onPointerDown={handlePointerDownContainer}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover absolute inset-0 pointer-events-none"
              />

              {/* AR HUD Essentials */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                {/* Center Crosshair / Balance Level */}
                <div className="relative flex items-center justify-center opacity-70 mix-blend-screen">
                    <div className="w-32 h-[1px] bg-brand-cyan/80 absolute shadow-[0_0_8px_rgba(34,211,238,0.5)]"></div>
                    <div className="w-[1px] h-32 bg-brand-cyan/80 absolute shadow-[0_0_8px_rgba(34,211,238,0.5)]"></div>
                    <div className="w-6 h-6 rounded-full border border-brand-cyan/50 absolute"></div>
                    <div className="w-1 h-1 rounded-full bg-brand-cyan absolute shadow-[0_0_5px_rgba(34,211,238,1)]"></div>
                    
                    {/* Horizon line indicator (simulated balance) */}
                    <div className="w-48 h-[1px] bg-emerald-400/50 absolute translate-y-16 flex justify-between items-center px-4 transition-transform duration-1000 ease-in-out">
                        <div className="w-8 h-[2px] bg-emerald-400/80 shadow-[0_0_5px_rgba(52,211,153,0.5)]"></div>
                        <div className="w-8 h-[2px] bg-emerald-400/80 shadow-[0_0_5px_rgba(52,211,153,0.5)]"></div>
                    </div>
                </div>
                
                {/* Simulated Feature Points tracking overlay */}
                {featurePoints.map(fp => (
                    <div 
                        key={fp.id} 
                        className="absolute flex items-center justify-center transition-all duration-700 ease-linear group"
                        style={{ left: `${fp.x}%`, top: `${fp.y}%`, opacity: fp.opacity }}
                    >
                        <div className="relative flex items-center justify-center">
                            <div className="absolute w-3 h-3 bg-yellow-400/40 rounded-full animate-ping" />
                            <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,1)]" />
                        </div>
                        <div className="absolute ml-8 text-[8px] font-mono text-yellow-400/70 bg-black/40 px-1 py-0.5 rounded backdrop-blur whitespace-nowrap">
                            x:{fp.wx} z:{fp.wz}
                        </div>
                    </div>
                ))}
                
                {/* Zone Detection & Auto Capture Status */}
                <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center space-x-4">
                  <div className="flex bg-slate-900/80 backdrop-blur border border-brand-cyan/30 rounded-xl overflow-hidden shadow-lg shadow-brand-cyan/10 pointer-events-auto">
                    <div className="px-4 py-2 flex items-center space-x-2 border-r border-brand-cyan/30">
                        <MapPin size={14} className="text-brand-cyan" />
                        <span className="text-xs font-bold text-white uppercase tracking-widest">{currentZone}</span>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setAutoCaptureEnabled(!autoCaptureEnabled); }}
                        className={`px-4 py-2 flex items-center space-x-2 transition-colors ${autoCaptureEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/10 text-slate-400'}`}
                    >
                        <Camera size={14} />
                        <span className="text-xs font-bold uppercase">Auto Capture {autoCaptureEnabled ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                </div>

                {/* Corner Framing */}
                <div className="absolute top-8 left-8 w-12 h-12 border-t-2 border-l-2 border-brand-cyan/30 mix-blend-screen"></div>
                <div className="absolute top-8 right-8 w-12 h-12 border-t-2 border-r-2 border-brand-cyan/30 mix-blend-screen"></div>
                <div className="absolute bottom-8 left-8 w-12 h-12 border-b-2 border-l-2 border-brand-cyan/30 mix-blend-screen"></div>
                <div className="absolute bottom-8 right-8 w-12 h-12 border-b-2 border-r-2 border-brand-cyan/30 mix-blend-screen"></div>
                
                {/* Captured Photos Reel */}
                {capturedPhotos.length > 0 && (
                    <div className="absolute left-8 top-24 bottom-32 w-16 flex flex-col space-y-2 overflow-y-auto no-scrollbar pointer-events-auto items-center py-4">
                        {capturedPhotos.map((photo) => (
                            <div 
                                key={photo.id} 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const matchingScan = project.roomScans?.find(s => s.roomName === photo.zone) || project.roomScans?.[0];
                                    if (matchingScan) {
                                        setSelectedWalkthrough(matchingScan);
                                    } else {
                                        alert('No 3D data available for this zone.');
                                    }
                                }}
                                className="relative group flex-shrink-0 animate-in fade-in zoom-in w-12 h-12 bg-slate-800 rounded-lg border-2 border-white/20 overflow-hidden shadow-lg shadow-black/50 hover:border-emerald-400 transition-colors cursor-pointer" 
                                title={`${photo.zone} (Click to View 3D Walkthrough)`}
                            >
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <MapPin size={16} className="text-slate-400 opacity-50" />
                                </div>
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5">
                                    <div className="text-[6px] text-center text-white font-bold uppercase truncate px-1">{photo.zone}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                {/* Simulated Data Readouts */}
                <div className="absolute bottom-32 md:bottom-16 left-4 md:left-12 text-[10px] font-mono text-cyan-400 uppercase flex flex-col space-y-1 drop-shadow-[0_0_2px_rgba(0,0,0,0.8)] bg-slate-900/40 p-3 rounded-lg backdrop-blur-sm border border-brand-cyan/20 pointer-events-none">
                    <div className="flex items-center space-x-2 mb-1"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span className="font-bold text-white tracking-widest">SYSTEM ACTIVE</span></div>
                    <span className="text-cyan-200">ENV: {project.waterCategory?.includes('Category 3') ? 'CRITICAL (CAT 3)' : project.waterCategory?.toUpperCase() || 'UNKNOWN'} | {project.lossClass?.toUpperCase() || 'NOT CLASSIFIED'}</span>
                    <span>POS: [34.0522, -118.2437, 1.2M]</span>
                    <span>HDG: 274° W (REL)</span>
                </div>

                {/* Stage Requirements Checklist */}
                <div className="absolute top-16 right-12 flex flex-col items-end space-y-2 pointer-events-none drop-shadow-md">
                    <div className="bg-slate-900/60 border border-brand-cyan/30 rounded-xl px-4 py-3 backdrop-blur-md w-48 text-right shadow-lg shadow-brand-cyan/10">
                        <div className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase mb-1">Active Stage</div>
                        <div className="text-white font-bold text-base mb-3">{project.currentStage}</div>
                        <div className="flex flex-col space-y-2 text-xs">
                             {project.currentStage === 'Intake' && (
                                <>
                                  <div className="flex items-center justify-end space-x-2 text-emerald-400"><span className="font-mono">Assess hazards</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Identify source</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Initial photos</span></div>
                                </>
                             )}
                             {project.currentStage === 'Inspection' && (
                                <>
                                  <div className="flex items-center justify-end space-x-2 text-emerald-400"><span className="font-mono">Source found</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Moisture mapping</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Material ID</span></div>
                                </>
                             )}
                             {project.currentStage === 'Scope' && (
                                <>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Measurements</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Generate Sketch</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Equipment calc</span></div>
                                </>
                             )}
                             {project.currentStage === 'Stabilize' && (
                                <>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Extract water</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Place equipment</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Containment</span></div>
                                </>
                             )}
                             {project.currentStage === 'Monitor' && (
                                <>
                                  <div className="flex items-center justify-end space-x-2 text-emerald-400"><span className="font-mono">Daily readings</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Check equipment</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Update progress</span></div>
                                </>
                             )}
                             {project.currentStage === 'Closeout' && (
                                <>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Final photos</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Remove equipment</span></div>
                                  <div className="flex items-center justify-end space-x-2 text-cyan-400"><span className="font-mono">Signatures</span></div>
                                </>
                             )}
                        </div>
                    </div>
                </div>
              </div>
              
              {/* AR Overlays */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center z-20">
                {arData.sitePlanUrl && (
                  <img 
                    src={arData.sitePlanUrl} 
                    alt="Site Plan Overlaid" 
                    className="max-w-full max-h-full object-contain opacity-40 mix-blend-screen"
                  />
                )}
                {/* Areas in AR (Simulated perspective) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {visibility.areas && areas.map(area => {
                    const cx = area.points.reduce((sum, p) => sum + p.x, 0) / area.points.length;
                    const cy = area.points.reduce((sum, p) => sum + p.y, 0) / area.points.length;
                    return (
                    <g key={area.id}>
                      <polygon 
                        points={polygonPoints(area.points)}
                        fill={area.color}
                        fillOpacity={selectedArea?.id === area.id ? 0.4 : 0.15}
                        stroke={selectedArea?.id === area.id ? '#ffffff' : area.color}
                        strokeWidth={selectedArea?.id === area.id ? "0.8" : "0.2"}
                        className={`pointer-events-auto cursor-pointer animate-pulse transition-all ${selectedArea?.id === area.id ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedArea(area);
                          setSelectedMarker(null);
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const svgElem = e.currentTarget.parentElement?.parentElement;
                          if(svgElem) {
                            const rect = svgElem.getBoundingClientRect();
                            const startX = ((e.clientX - rect.left) / rect.width) * 100;
                            const startY = ((e.clientY - rect.top) / rect.height) * 100;
                            setDraggingItem({ type: 'area', id: area.id, lastX: startX, lastY: startY, initialPoints: [...area.points] });
                          }
                          setSelectedArea(area);
                          setSelectedMarker(null);
                        }}
                      />
                      {(area.sqFeet || area.linearFeet) && (
                        <text x={cx} y={cy} fontSize="2" fill="#ffffff" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" className="pointer-events-none drop-shadow-[0_0_4px_rgba(0,0,0,0.8)] font-mono opacity-80">
                            {area.sqFeet ? `${area.sqFeet} SF` : ''} {area.sqFeet && area.linearFeet ? '|' : ''} {area.linearFeet ? `${area.linearFeet} LF` : ''}
                        </text>
                      )}
                    </g>
                  )})}

                  {/* Draggable vertices for selected area in AR view */}
                  {visibility.areas && selectedArea && (
                    <g>
                      {selectedArea.points.map((p, i) => {
                        const nextIndex = (i + 1) % selectedArea.points.length;
                        const nextP = selectedArea.points[nextIndex];
                        const midX = (p.x + nextP.x) / 2;
                        const midY = (p.y + nextP.y) / 2;

                        return (
                          <React.Fragment key={`ar-edge-${selectedArea.id}-${i}`}>
                            <circle 
                              cx={p.x} 
                              cy={p.y} 
                              r="1.5"
                              fill="#ffffff"
                              stroke={selectedArea.color}
                              strokeWidth="0.5"
                              className="cursor-move pointer-events-auto hover:scale-150 transition-transform"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                setDraggingItem({ type: 'area_point', id: selectedArea.id, pointIndex: i });
                              }}
                            />
                            <circle 
                              cx={midX} 
                              cy={midY} 
                              r="1"
                              fill="#ffffff"
                              fillOpacity="0.5"
                              stroke={selectedArea.color}
                              strokeWidth="0.5"
                              className="cursor-pointer pointer-events-auto hover:r-[1.5] hover:fill-opacity-100 transition-all"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                const newPoints = [...selectedArea.points];
                                newPoints.splice(nextIndex, 0, { x: midX, y: midY });
                                updateArea(selectedArea.id, { points: newPoints });
                                setDraggingItem({ type: 'area_point', id: selectedArea.id, pointIndex: nextIndex });
                              }}
                            />
                          </React.Fragment>
                        );
                      })}
                    </g>
                  )}

                  {interactionMode === 'draw_area' && currentAreaPoints.length > 0 && (
                    <>
                      <polyline 
                        points={polygonPoints(currentAreaPoints)}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="0.5"
                        strokeDasharray="1,1"
                      />
                      {currentAreaPoints.map((p, i) => (
                        <circle 
                          key={i} 
                          cx={p.x} 
                          cy={p.y} 
                          r="1.5" 
                          fill="#06b6d4" 
                          className="cursor-move pointer-events-auto hover:scale-150 transition-transform"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setDraggingItem({ type: 'current_area_point', id: 'current', pointIndex: i });
                          }}
                        />
                      ))}
                    </>
                  )}
                  {visibility.boundingBox && (() => {
                    const bbox = getBoundingBox();
                    if (!bbox) return null;
                    return (
                      <rect 
                        x={bbox.minX} 
                        y={bbox.minY} 
                        width={bbox.maxX - bbox.minX} 
                        height={bbox.maxY - bbox.minY} 
                        fill="none" 
                        stroke="#06b6d4" 
                        strokeWidth="0.5" 
                        strokeDasharray="2,2" 
                      />
                    );
                  })()}
                  {interactionMode === 'set_scale' && scalePoints.length > 0 && (
                    <>
                      {scalePoints.length === 2 && (
                        <line 
                          x1={scalePoints[0].x} 
                          y1={scalePoints[0].y} 
                          x2={scalePoints[1].x} 
                          y2={scalePoints[1].y} 
                          stroke="#06b6d4" 
                          strokeWidth="0.5" 
                        />
                      )}
                      {scalePoints.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r="1" fill="#06b6d4" />
                      ))}
                    </>
                  )}

                  {/* Measurements Rendering in AR View */}
                  {visibility.measurements && measurements.map(m => (
                    <g key={m.id}>
                      <line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="1,1" className="drop-shadow-md" />
                      <circle cx={m.p1.x} cy={m.p1.y} r="0.8" fill="#f59e0b" className="drop-shadow-md" />
                      <circle cx={m.p2.x} cy={m.p2.y} r="0.8" fill="#f59e0b" className="drop-shadow-md" />
                      <text x={(m.p1.x + m.p2.x)/2} y={(m.p1.y + m.p2.y)/2} fontSize="2" fill="#ffffff" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" className="pointer-events-none drop-shadow-md font-mono" dy="-2">
                        {m.distance} ft
                      </text>
                      {/* Delete button */}
                      <circle cx={(m.p1.x + m.p2.x)/2} cy={(m.p1.y + m.p2.y)/2 + 2} r="1.5" fill="red" fillOpacity="0.8" className="cursor-pointer pointer-events-auto hover:fill-opacity-100 transition-all drop-shadow-md" 
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdate({
                            arMapping: {
                              ...arData,
                              measurements: measurements.filter(meas => meas.id !== m.id)
                            }
                          });
                        }}
                      />
                      <text x={(m.p1.x + m.p2.x)/2} y={(m.p1.y + m.p2.y)/2 + 2} fontSize="1.5" fill="white" textAnchor="middle" dominantBaseline="middle" className="pointer-events-none font-bold">
                         X
                      </text>
                    </g>
                  ))}
                  
                  {interactionMode === 'measure_distance' && measurementPoints.length === 1 && (
                     <circle cx={measurementPoints[0].x} cy={measurementPoints[0].y} r="1" fill="#f59e0b" className="drop-shadow-md" />
                  )}

                </svg>

                {/* Markers in AR */}
                {visibility.markers && markers.map(marker => (
                  <div 
                    key={marker.id}
                    className="absolute z-10 pointer-events-auto cursor-pointer flex flex-col items-center"
                    style={{ 
                      left: `${marker.x}%`, 
                      top: `${marker.y}%`,
                      transform: 'translate(-50%, -100%)'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMarker(marker);
                      setSelectedArea(null);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedMarker(marker);
                      setSelectedArea(null);
                      setDraggingItem({ type: 'marker', id: marker.id });
                    }}
                  >
                    <div className="animate-float flex flex-col items-center" style={{ animationDelay: `${(marker.x + marker.y) % 2}s` }}>
                      <div className={`backdrop-blur-md rounded-2xl p-3 shadow-lg transition-transform ${selectedMarker?.id === marker.id ? 'scale-110 border-white' : ''}`} style={{ backgroundColor: `${marker.color || '#06b6d4'}33`, borderColor: selectedMarker?.id === marker.id ? '#ffffff' : `${marker.color || '#06b6d4'}80`, borderWidth: selectedMarker?.id === marker.id ? '2px' : '1px' }}>
                        <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-900" style={{ backgroundColor: marker.color || '#06b6d4' }}>
                          {getMarkerIcon(marker.type)}
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-wider">{marker.label}</p>
                          {marker.type === 'equipment' && marker.equipmentType && (
                            <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest mt-0.5">
                              {marker.equipmentType} {marker.equipmentStatus ? `• ${marker.equipmentStatus}` : ''}
                            </p>
                          )}
                          {marker.value && <p className="text-xs font-bold mt-0.5" style={{ color: marker.color || '#06b6d4' }}>{marker.value}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="w-0.5 h-8 mt-1" style={{ background: `linear-gradient(to bottom, ${marker.color || '#06b6d4'}, transparent)` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Interactive AR Toolbar */}
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-white/20 rounded-2xl px-2 py-2 flex items-center shadow-2xl z-30 shadow-brand-cyan/20 pointer-events-auto">
                <div className="flex items-center space-x-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setInteractionMode('select'); setCurrentAreaPoints([]); setMeasurementPoints([]); }}
                    className={`flex items-center justify-center p-3 rounded-xl transition-all ${interactionMode === 'select' ? 'bg-brand-cyan text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title="Select objects"
                  >
                    <MousePointer2 size={24} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setInteractionMode('add_marker'); setCurrentAreaPoints([]); setMeasurementPoints([]); }}
                    className={`flex items-center justify-center p-3 rounded-xl transition-all ${interactionMode === 'add_marker' ? 'bg-brand-cyan text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title="Place marker"
                  >
                    <Crosshair size={24} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setInteractionMode('draw_area'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
                    className={`flex items-center justify-center p-3 rounded-xl transition-all ${interactionMode === 'draw_area' ? 'bg-brand-cyan text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title="Draw area polygon"
                  >
                    <PenTool size={24} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setInteractionMode('measure_distance'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
                    className={`flex items-center justify-center p-3 rounded-xl transition-all ${interactionMode === 'measure_distance' ? 'bg-brand-cyan text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title="Measure distance"
                  >
                    <Layers size={24} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setInteractionMode('set_scale'); setCurrentAreaPoints([]); setScalePoints([]); setMeasurementPoints([]); }}
                    className={`flex items-center justify-center p-3 rounded-xl transition-all ${interactionMode === 'set_scale' ? 'bg-brand-cyan text-slate-900 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                    title="Set measuring scale"
                  >
                    <Maximize size={24} />
                  </button>
                </div>
                
                <div className="w-px h-8 bg-white/20 mx-3" />
                
                <div className="flex flex-col items-center justify-center px-2">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-cyan">AR Active</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-slate-300">{markers.length + areas.length} Objects</span>
                </div>
              </div>

              {interactionMode === 'draw_area' && currentAreaPoints.length > 0 && (
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 flex items-center space-x-4 bg-slate-900/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl z-30 pointer-events-auto">
                  <button 
                    onClick={(e) => { e.stopPropagation(); saveArea(); }}
                    className="px-6 py-2 bg-green-500 text-slate-900 rounded-xl text-xs font-black uppercase flex items-center space-x-2 hover:bg-green-400 transition-colors shadow-lg"
                  >
                    <Save size={16} />
                    <span>Save Area Layout</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setCurrentAreaPoints([]); }}
                    className="px-6 py-2 bg-white/10 text-slate-300 rounded-xl text-xs font-black uppercase hover:bg-white/20 transition-colors"
                  >
                    Clear Points
                  </button>
                </div>
              )}

              {interactionMode === 'set_scale' && scalePoints.length > 0 && (
                <div className="absolute bottom-36 left-1/2 -translate-x-1/2 flex items-center space-x-4 bg-slate-900/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl z-30 pointer-events-auto">
                  {scalePoints.length === 2 ? (
                    <>
                      <input 
                        type="number" 
                        value={scaleDistance}
                        onChange={(e) => setScaleDistance(Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className="w-24 bg-slate-950 border border-brand-cyan/50 rounded-xl px-4 py-2 text-sm text-center text-white outline-none focus:border-brand-cyan shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                      />
                      <span className="text-xs text-brand-cyan font-black uppercase">ft</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); saveScale(); }}
                        className="px-6 py-2 bg-brand-cyan text-slate-900 rounded-xl text-xs font-black uppercase flex items-center space-x-2 hover:bg-cyan-400 transition-colors shadow-lg"
                      >
                        <Check size={16} />
                        <span>Confirm Scale</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-slate-300 uppercase px-4 py-2">Click second point</span>
                  )}
                </div>
              )}

              {interactionMode !== 'select' && (
                <div className="absolute inset-0 border-4 border-brand-cyan/30 pointer-events-none flex items-center justify-center">
                  <div className="bg-brand-cyan text-slate-900 px-4 py-2 rounded-xl font-black uppercase text-xs tracking-widest shadow-2xl">
                    {interactionMode === 'add_marker' ? 'Tap Screen to Place Marker' : 'Tap Screen to Map Area Points'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Sidebar */}
        <div className={`absolute md:relative right-0 h-full bg-slate-900 border-l border-white/5 flex flex-col z-30 transition-all duration-300 shadow-2xl md:shadow-none ${isSidebarCollapsed ? 'w-0 border-l-0' : 'w-72 md:w-80'}`}>
            <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
                className={`absolute top-6 w-6 h-6 bg-slate-800 rounded-full border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors z-40 ${isSidebarCollapsed ? '-left-9' : '-left-3'}`}
            >
                {isSidebarCollapsed ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>
            
            <div className={`flex flex-col flex-1 overflow-hidden transition-opacity duration-300 ${isSidebarCollapsed ? 'opacity-0 invisible' : 'opacity-100 visible'}`}>
              <div className="p-4 bg-slate-900/50 backdrop-blur-md border-b border-white/5 flex items-center justify-between flex-shrink-0">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center">
                  <Layers size={14} className="mr-2 text-brand-cyan" />
                  Mapping Inventory

            </h3>
            {(selectedMarker || selectedArea) && (
              <button 
                onClick={() => { setSelectedMarker(null); setSelectedArea(null); }}
                className="p-1.5 bg-white/5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">
            {selectedMarker ? (
              <div className="p-6 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-brand-cyan tracking-widest">Marker Properties</span>
                    <button 
                      onClick={() => deleteMarker(selectedMarker.id)} 
                      className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Delete Marker"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">{selectedMarker.label}</h2>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Identity Label</label>
                    <input 
                      type="text"
                      value={selectedMarker.label}
                      onChange={(e) => updateMarker(selectedMarker.id, { label: e.target.value })}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/30 transition-all"
                      placeholder="e.g. Dehumidifier 01"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Classification</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['equipment', 'damage', 'moisture', 'note'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => updateMarker(selectedMarker.id, { type })}
                          className={`flex flex-col items-start p-3 rounded-xl border transition-all gap-2 ${selectedMarker.type === type ? 'bg-white/5 border-white/20 text-white shadow-lg' : 'bg-slate-950 border-white/5 text-slate-500 hover:border-white/20'}`}
                        >
                          <div className={`p-1.5 rounded-lg ${selectedMarker.type === type ? 'text-slate-900' : 'bg-slate-900 text-slate-500'}`} style={{ backgroundColor: selectedMarker.type === type ? (selectedMarker.color || '#06b6d4') : undefined }}>
                            {getMarkerIcon(type)}
                          </div>
                          <span className="text-[10px] uppercase font-black tracking-wider">{type}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Custom Visualization</label>
                    <div className="flex items-center p-3 bg-slate-950 rounded-xl border border-white/5 gap-4">
                      <div className="relative group">
                        <input 
                          type="color"
                          value={selectedMarker.color || '#06b6d4'}
                          onChange={(e) => updateMarker(selectedMarker.id, { color: e.target.value })}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                        />
                        <div 
                          className="w-10 h-10 rounded-lg border border-white/20 shadow-lg transition-transform group-hover:scale-110" 
                          style={{ backgroundColor: selectedMarker.color || '#06b6d4' }} 
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-500 uppercase mb-0.5">Hex Code</div>
                        <div className="text-sm font-mono text-white uppercase tracking-tighter">{selectedMarker.color || '#06b6d4'}</div>
                      </div>
                      <Palette size={18} className="text-slate-600" />
                    </div>
                  </div>

                  {selectedMarker.type === 'equipment' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Equipment Type</label>
                        <select
                          value={selectedMarker.equipmentType || ''}
                          onChange={(e) => updateMarker(selectedMarker.id, { equipmentType: e.target.value })}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/30 transition-all"
                        >
                          <option value="" disabled>Select Equipment Type...</option>
                          <option value="Dehumidifier">Dehumidifier</option>
                          <option value="Air Mover">Air Mover</option>
                          <option value="Air Scrubber">Air Scrubber</option>
                          <option value="Heater">Heater</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Status</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => updateMarker(selectedMarker.id, { equipmentStatus: 'Running' })}
                            className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all ${selectedMarker.equipmentStatus === 'Running' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-950 border-white/5 text-slate-500 hover:border-white/20'}`}
                          >
                            <Power size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">Running</span>
                          </button>
                          <button
                            onClick={() => updateMarker(selectedMarker.id, { equipmentStatus: 'Off' })}
                            className={`flex items-center justify-center space-x-2 p-3 rounded-xl border transition-all ${selectedMarker.equipmentStatus === 'Off' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-slate-950 border-white/5 text-slate-500 hover:border-white/20'}`}
                          >
                            <PowerOff size={14} />
                            <span className="text-xs font-bold uppercase tracking-widest">Off</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">
                      {selectedMarker.type === 'moisture' ? 'Moisture Reading' : 
                       selectedMarker.type === 'damage' ? 'Damage Assessment' : 
                       selectedMarker.type === 'equipment' ? 'Telemetry / Notes' : 'Notes'}
                    </label>
                    {selectedMarker.type === 'moisture' ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center bg-slate-950 border border-white/10 rounded-xl overflow-hidden focus-within:border-brand-cyan focus-within:ring-1 focus-within:ring-brand-cyan/30 transition-all">
                          <input
                            type="text"
                            value={selectedMarker.value?.replace(/[^0-9.]/g, '') || ''}
                            onChange={(e) => updateMarker(selectedMarker.id, { value: e.target.value ? `${e.target.value}%` : '' })}
                            className="w-full bg-transparent p-3 text-sm text-white outline-none font-mono"
                            placeholder="e.g. 18.5"
                          />
                          <span className="px-4 text-brand-cyan font-bold border-l border-white/10 bg-white/5">% MC</span>
                        </div>
                      </div>
                    ) : selectedMarker.type === 'damage' ? (
                      <div className="space-y-2">
                        <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
                           {['Category 1', 'Category 2', 'Category 3', 'Class 1', 'Class 2', 'Class 3', 'Class 4'].map(tag => (
                             <button
                               key={tag}
                               onClick={() => {
                                 const currentVal = selectedMarker.value || '';
                                 const newVal = currentVal ? `${currentVal} | ${tag}` : tag;
                                 updateMarker(selectedMarker.id, { value: newVal });
                               }}
                               className="whitespace-nowrap text-[9px] uppercase font-bold bg-white/5 hover:bg-amber-500/20 hover:text-amber-400 border border-white/10 text-slate-400 py-1.5 px-2 rounded transition-colors"
                             >
                               + {tag}
                             </button>
                           ))}
                        </div>
                        <textarea 
                          value={selectedMarker.value || ''}
                          onChange={(e) => updateMarker(selectedMarker.id, { value: e.target.value })}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/30 transition-all min-h-[100px] resize-none"
                          placeholder="Describe the damage extent and affected materials..."
                        />
                      </div>
                    ) : (
                      <textarea 
                        value={selectedMarker.value || ''}
                        onChange={(e) => updateMarker(selectedMarker.id, { value: e.target.value })}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/30 transition-all min-h-[100px] resize-none"
                        placeholder="Enter additional details or measurements..."
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Tags</label>
                      <button 
                        onClick={() => suggestTags(selectedMarker, true)}
                        disabled={isSuggestingTags}
                        className="text-[10px] bg-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/30 px-2 py-1 rounded font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <Tag size={10} />
                        {isSuggestingTags ? 'Suggesting...' : 'AI Suggest Tags'}
                      </button>
                    </div>
                    <div className="pt-1">
                      <input 
                        type="text"
                        placeholder="Type and press Enter to add custom tag..."
                        className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-brand-cyan transition-all shadow-inner"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            const currentTags = selectedMarker.tags || [];
                            if (!currentTags.includes(val)) {
                              const newTags = [...currentTags, val];
                              updateMarker(selectedMarker.id, { tags: newTags });
                              setSelectedMarker({ ...selectedMarker, tags: newTags });
                            }
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMarker.tags?.map(tag => (
                        <span key={tag} className="bg-white/10 text-slate-300 text-[10px] px-2 py-1 rounded flex items-center gap-1">
                          {tag}
                          <button 
                            onClick={() => {
                              const newTags = selectedMarker.tags?.filter(t => t !== tag);
                              updateMarker(selectedMarker.id, { tags: newTags });
                              setSelectedMarker({ ...selectedMarker, tags: newTags });
                            }}
                            className="hover:text-red-400"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      {(!selectedMarker.tags || selectedMarker.tags.length === 0) && (
                        <span className="text-[10px] text-slate-600 italic">No tags</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Linked Photos</label>
                      <button 
                        onClick={() => setPhotoPickerFor({ type: 'marker', id: selectedMarker.id })}
                        className="text-[10px] bg-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/30 px-2 py-1 rounded font-bold transition-colors flex items-center gap-1"
                      >
                        <Plus size={10} />
                        Link Photo
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                      {selectedMarker.linkedPhotos?.map(photoId => {
                         const p = capturedPhotos.find(cp => cp.id === photoId);
                         if (!p) return null;
                         return (
                           <div key={photoId} className="relative group flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-slate-900">
                             {p.url ? (
                               <img src={p.url} alt="linked" className="w-full h-full object-cover" />
                             ) : (
                               <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                                 <Camera size={16} />
                                 <span className="text-[8px] uppercase tracking-wider mt-1">{p.zone}</span>
                               </div>
                             )}
                             <button
                               onClick={() => {
                                 const newPhotos = selectedMarker.linkedPhotos?.filter(id => id !== photoId);
                                 updateMarker(selectedMarker.id, { linkedPhotos: newPhotos });
                                 setSelectedMarker({ ...selectedMarker, linkedPhotos: newPhotos });
                               }}
                               className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                               <X size={10} />
                             </button>
                           </div>
                         );
                      })}
                      {(!selectedMarker.linkedPhotos || selectedMarker.linkedPhotos.length === 0) && (
                        <div className="text-[10px] text-slate-600 italic">No photos linked</div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-xl border border-white/5 space-y-2">
                    <div className="flex flex-col space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Coordinates (%)</span>
                      <div className="flex space-x-2">
                        <div className="flex-1 flex items-center bg-slate-900 border border-white/10 rounded px-2 py-1">
                          <span className="text-xs text-slate-500 mr-2">X</span>
                          <input 
                            type="number" 
                            value={selectedMarker.x.toFixed(1)}
                            onChange={(e) => updateMarker(selectedMarker.id, { x: Number(e.target.value) })}
                            className="w-full bg-transparent text-xs text-white outline-none font-mono"
                          />
                        </div>
                        <div className="flex-1 flex items-center bg-slate-900 border border-white/10 rounded px-2 py-1">
                          <span className="text-xs text-slate-500 mr-2">Y</span>
                          <input 
                            type="number" 
                            value={selectedMarker.y.toFixed(1)}
                            onChange={(e) => updateMarker(selectedMarker.id, { y: Number(e.target.value) })}
                            className="w-full bg-transparent text-xs text-white outline-none font-mono"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-500 uppercase">Timestamp</span>
                      <span className="text-slate-300 font-mono">{new Date(selectedMarker.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : selectedArea ? (
              <div className="p-6 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-brand-cyan tracking-widest">Area Configuration</span>
                    <button 
                      onClick={() => deleteArea(selectedArea.id)} 
                      className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Delete Area"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h2 className="text-xl font-bold text-white tracking-tight">{selectedArea.label}</h2>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Area Label</label>
                    <input 
                      type="text"
                      value={selectedArea.label}
                      onChange={(e) => updateArea(selectedArea.id, { label: e.target.value })}
                      className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan/30 transition-all"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Mitigation Status</label>
                    <div className="space-y-2">
                      {(['affected', 'mitigated', 'safe'] as const).map(type => {
                        const colors = { affected: '#ef4444', mitigated: '#eab308', safe: '#10b981' };
                        const isActive = selectedArea.type === type;
                        return (
                          <button
                            key={type}
                            onClick={() => updateArea(selectedArea.id, { type, color: colors[type] })}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${isActive ? 'bg-white/5 border-white/20 text-white' : 'bg-slate-950 border-white/5 text-slate-500 hover:border-white/10'}`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: isActive ? colors[type] : '#1e293b' }} />
                              <span className={`text-xs font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-slate-500'}`}>{type}</span>
                            </div>
                            {isActive && <Check size={14} className="text-brand-cyan" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Custom Visualization</label>
                    <div className="flex items-center p-3 bg-slate-950 rounded-xl border border-white/5 gap-4">
                      <div className="relative group">
                        <input 
                          type="color"
                          value={selectedArea.color}
                          onChange={(e) => updateArea(selectedArea.id, { color: e.target.value })}
                          className="opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10"
                        />
                        <div 
                          className="w-10 h-10 rounded-lg border border-white/20 shadow-lg transition-transform group-hover:scale-110" 
                          style={{ backgroundColor: selectedArea.color }} 
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-500 uppercase mb-0.5">Hex Code</div>
                        <div className="text-sm font-mono text-white uppercase tracking-tighter">{selectedArea.color}</div>
                      </div>
                      <Palette size={18} className="text-slate-600" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Tags</label>
                      <button 
                        onClick={() => suggestTags(selectedArea, false)}
                        disabled={isSuggestingTags}
                        className="text-[10px] bg-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/30 px-2 py-1 rounded font-bold transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <Tag size={10} />
                        {isSuggestingTags ? 'Suggesting...' : 'AI Suggest Tags'}
                      </button>
                    </div>
                    <div className="pt-1">
                      <input 
                        type="text"
                        placeholder="Type and press Enter to add custom tag..."
                        className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-brand-cyan transition-all shadow-inner"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            const currentTags = selectedArea.tags || [];
                            if (!currentTags.includes(val)) {
                              const newTags = [...currentTags, val];
                              updateArea(selectedArea.id, { tags: newTags });
                              setSelectedArea({ ...selectedArea, tags: newTags });
                            }
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedArea.tags?.map(tag => (
                        <span key={tag} className="bg-white/10 text-slate-300 text-[10px] px-2 py-1 rounded flex items-center gap-1">
                          {tag}
                          <button 
                            onClick={() => {
                              const newTags = selectedArea.tags?.filter(t => t !== tag);
                              updateArea(selectedArea.id, { tags: newTags });
                              setSelectedArea({ ...selectedArea, tags: newTags });
                            }}
                            className="hover:text-red-400"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      {(!selectedArea.tags || selectedArea.tags.length === 0) && (
                        <span className="text-[10px] text-slate-600 italic">No tags</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Linked Photos</label>
                      <button 
                        onClick={() => setPhotoPickerFor({ type: 'area', id: selectedArea.id })}
                        className="text-[10px] bg-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/30 px-2 py-1 rounded font-bold transition-colors flex items-center gap-1"
                      >
                        <Plus size={10} />
                        Link Photo
                      </button>
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                      {selectedArea.linkedPhotos?.map(photoId => {
                         const p = capturedPhotos.find(cp => cp.id === photoId);
                         if (!p) return null;
                         return (
                           <div key={photoId} className="relative group flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-slate-900">
                             {p.url ? (
                               <img src={p.url} alt="linked" className="w-full h-full object-cover" />
                             ) : (
                               <div className="w-full h-full flex flex-col items-center justify-center text-slate-600">
                                 <Camera size={16} />
                                 <span className="text-[8px] uppercase tracking-wider mt-1">{p.zone}</span>
                               </div>
                             )}
                             <button
                               onClick={() => {
                                 const newPhotos = selectedArea.linkedPhotos?.filter(id => id !== photoId);
                                 updateArea(selectedArea.id, { linkedPhotos: newPhotos });
                                 setSelectedArea({ ...selectedArea, linkedPhotos: newPhotos });
                               }}
                               className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                               <X size={10} />
                             </button>
                           </div>
                         );
                      })}
                      {(!selectedArea.linkedPhotos || selectedArea.linkedPhotos.length === 0) && (
                        <div className="text-[10px] text-slate-600 italic">No photos linked</div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Measurements</label>
                    <div className="flex space-x-2">
                        <div className="flex-1 flex flex-col space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Square Footage</span>
                          <input 
                            type="number" step="0.1"
                            value={selectedArea.sqFeet || ''} 
                            onChange={(e) => updateArea(selectedArea.id, { sqFeet: Number(e.target.value) })}
                            placeholder="e.g. 150"
                            className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-brand-cyan font-mono"
                          />
                        </div>
                        <div className="flex-1 flex flex-col space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Linear Footage (Walls)</span>
                          <input 
                            type="number" step="0.1"
                            value={selectedArea.linearFeet || ''} 
                            onChange={(e) => updateArea(selectedArea.id, { linearFeet: Number(e.target.value) })}
                            placeholder="e.g. 45"
                            className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-brand-cyan font-mono"
                          />
                        </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Dimensions (%)</label>
                    <div className="flex space-x-2">
                       {(() => {
                           let minX = 100, maxX = 0, minY = 100, maxY = 0;
                           selectedArea.points.forEach(p => {
                               if (p.x < minX) minX = p.x;
                               if (p.x > maxX) maxX = p.x;
                               if (p.y < minY) minY = p.y;
                               if (p.y > maxY) maxY = p.y;
                           });
                           const w = maxX > minX ? maxX - minX : 1;
                           const h = maxY > minY ? maxY - minY : 1;
                           const cx = (minX + maxX) / 2;
                           const cy = (minY + maxY) / 2;
                           
                           const updateWidth = (newW: number) => {
                               if(newW <= 0.1 || w <= 0.1) return;
                               const scaleW = newW / w;
                               const newPoints = selectedArea.points.map(p => ({ ...p, x: cx + (p.x - cx) * scaleW }));
                               updateArea(selectedArea.id, { points: newPoints });
                           };
                           const updateHeight = (newH: number) => {
                               if(newH <= 0.1 || h <= 0.1) return;
                               const scaleH = newH / h;
                               const newPoints = selectedArea.points.map(p => ({ ...p, y: cy + (p.y - cy) * scaleH }));
                               updateArea(selectedArea.id, { points: newPoints });
                           };

                           return (
                               <>
                                 <div className="flex-1 flex flex-col space-y-1">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold">Width (X-axis)</span>
                                    <input 
                                      type="number" step="0.1"
                                      value={w.toFixed(1)} 
                                      onChange={(e) => updateWidth(Number(e.target.value))}
                                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-brand-cyan font-mono"
                                    />
                                    {arData.scale && <span className="text-[9px] text-emerald-400 font-bold">{(w / arData.scale).toFixed(1)} ft</span>}
                                 </div>
                                 <div className="flex-1 flex flex-col space-y-1">
                                    <span className="text-[10px] text-slate-500 uppercase font-bold">Height (Y-axis)</span>
                                    <input 
                                      type="number" step="0.1"
                                      value={h.toFixed(1)} 
                                      onChange={(e) => updateHeight(Number(e.target.value))}
                                      className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-brand-cyan font-mono"
                                    />
                                    {arData.scale && <span className="text-[9px] text-emerald-400 font-bold">{(h / arData.scale).toFixed(1)} ft</span>}
                                 </div>
                               </>
                           );
                       })()}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Area Vertices</label>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 no-scrollbar">
                      {selectedArea.points.map((point, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-slate-950 rounded-xl border border-white/5">
                          <div className="flex items-center space-x-3">
                            <div className="w-5 h-5 rounded-md bg-white/5 text-[10px] font-bold flex items-center justify-center text-slate-400">
                              {index + 1}
                            </div>
                            <div className="flex items-center space-x-2 text-xs font-mono text-slate-300">
                              <input 
                                type="number" 
                                value={point.x.toFixed(1)}
                                onChange={(e) => {
                                  const newPoints = [...selectedArea.points];
                                  newPoints[index].x = Number(e.target.value);
                                  updateArea(selectedArea.id, { points: newPoints });
                                }}
                                className="w-12 bg-slate-900 border border-white/10 rounded px-1 py-0.5 text-center outline-none focus:border-brand-cyan"
                              />
                              <span className="text-slate-500">,</span>
                              <input 
                                type="number" 
                                value={point.y.toFixed(1)}
                                onChange={(e) => {
                                  const newPoints = [...selectedArea.points];
                                  newPoints[index].y = Number(e.target.value);
                                  updateArea(selectedArea.id, { points: newPoints });
                                }}
                                className="w-12 bg-slate-900 border border-white/10 rounded px-1 py-0.5 text-center outline-none focus:border-brand-cyan"
                              />
                            </div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => movePointUp(index)}
                              disabled={index === 0}
                              className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => movePointDown(index)}
                              disabled={index === selectedArea.points.length - 1}
                              className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              onClick={() => removePoint(index)}
                              disabled={selectedArea.points.length <= 3}
                              className="p-1 text-slate-500 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors ml-1"
                              title={selectedArea.points.length <= 3 ? "Minimum 3 points required" : "Delete point"}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-xl border border-white/5 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-500 uppercase">Vertices</span>
                      <span className="text-slate-300 font-mono">{selectedArea.points.length} Points</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold">
                      <span className="text-slate-500 uppercase">Created</span>
                      <span className="text-slate-300 font-mono">{new Date(selectedArea.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-0 flex flex-col h-full overflow-hidden">
                {/* Redesigned Sidebar Tabs Navigation */}
                <div className="flex bg-slate-950 p-1 border-b border-white/5 flex-shrink-0">
                  <button
                    onClick={() => setSidebarTab('inventory')}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${sidebarTab === 'inventory' ? 'bg-white/10 text-brand-cyan shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Layers size={15} className="mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Inventory</span>
                  </button>
                  <button
                    onClick={() => setSidebarTab('walkthroughs')}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${sidebarTab === 'walkthroughs' ? 'bg-white/10 text-brand-cyan shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Play size={15} className="mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">3D Scans</span>
                  </button>
                  <button
                    onClick={() => setSidebarTab('ai-capture')}
                    className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl transition-all ${sidebarTab === 'ai-capture' ? 'bg-white/10 text-brand-cyan shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    <Gauge size={15} className="mb-1" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">Calibration</span>
                  </button>
                </div>

                {/* Tab 1: inventory */}
                {sidebarTab === 'inventory' && (
                  <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in duration-200">
                    {/* Summary Stats */}
                    <div className="p-4 grid grid-cols-2 gap-3 border-b border-white/5 flex-shrink-0">
                      <div className="bg-slate-950 p-3 rounded-xl border border-white/5 flex flex-col justify-between">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Markers</span>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-xl font-black text-white">{markers.length}</span>
                          <span className="text-[9px] font-bold text-brand-cyan">Active</span>
                        </div>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-xl border border-white/5 flex flex-col justify-between">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Areas</span>
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-xl font-black text-white">{areas.length}</span>
                          <span className="text-[9px] font-bold text-emerald-400">
                            {areas.reduce((acc, curr) => acc + (curr.sqFeet || 0), 0)} SF
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Search Input */}
                    <div className="p-4 border-b border-white/5 flex-shrink-0">
                      <div className="relative group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-brand-cyan transition-colors" />
                        <input 
                          type="text" 
                          placeholder="Search markers and areas..." 
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-slate-950/50 rounded-xl pl-9 pr-3 py-2 text-xs border border-white/5 focus:ring-1 focus:ring-brand-cyan/50 focus:border-brand-cyan/50 focus:outline-none placeholder-slate-600 text-white transition-all" 
                        />
                      </div>
                    </div>

                    {/* Inventory List (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
                      {filteredAreas.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">Mapped Areas</h4>
                          <div className="space-y-2">
                            {filteredAreas.map(area => (
                              <div 
                                key={area.id}
                                onClick={() => { setSelectedArea(area); setSelectedMarker(null); }}
                                className="group flex items-center justify-between p-3 bg-slate-950 hover:bg-white/5 border border-white/5 rounded-xl cursor-pointer transition-all"
                              >
                                <div className="flex items-center space-x-3 overflow-hidden">
                                  <div className="w-2.5 h-2.5 rounded-full shadow-lg flex-shrink-0" style={{ backgroundColor: area.color }} />
                                  <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-bold text-white group-hover:text-brand-cyan transition-colors truncate">{area.label}</span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">{area.type}</span>
                                        {(area.sqFeet !== undefined || area.linearFeet !== undefined) && (
                                            <span className="text-[8px] text-emerald-400 font-bold tracking-wider">
                                                {area.sqFeet ? `${area.sqFeet} SF` : ''} {area.sqFeet && area.linearFeet ? '|' : ''} {area.linearFeet ? `${area.linearFeet} LF` : ''}
                                            </span>
                                        )}
                                    </div>
                                  </div>
                                </div>
                                <ArrowRight size={12} className="text-slate-700 group-hover:text-brand-cyan group-hover:translate-x-1 transition-all flex-shrink-0" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {filteredMarkers.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] px-1">Point Markers</h4>
                          <div className="space-y-2">
                            {filteredMarkers.map(marker => (
                              <div 
                                key={marker.id}
                                onClick={() => { setSelectedMarker(marker); setSelectedArea(null); }}
                                className="group flex items-center justify-between p-3 bg-slate-950 hover:bg-white/5 border border-white/5 rounded-xl cursor-pointer transition-all"
                              >
                                <div className="flex items-center space-x-3 overflow-hidden">
                                  <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-slate-500 group-hover:bg-brand-cyan group-hover:text-slate-900 transition-all flex-shrink-0">
                                    {getMarkerIcon(marker.type)}
                                  </div>
                                  <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-bold text-white group-hover:text-brand-cyan transition-colors truncate">{marker.label}</span>
                                    <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mt-0.5 truncate">
                                      {marker.type}
                                      {marker.type === 'equipment' && marker.equipmentType ? ` • ${marker.equipmentType}` : ''}
                                      {marker.type === 'equipment' && marker.equipmentStatus ? ` (${marker.equipmentStatus})` : ''}
                                    </span>
                                  </div>
                                </div>
                                <ArrowRight size={12} className="text-slate-700 group-hover:text-brand-cyan group-hover:translate-x-1 transition-all flex-shrink-0" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {filteredMarkers.length === 0 && filteredAreas.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                          <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-white/5 flex items-center justify-center text-slate-700">
                            <MapPin size={22} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-400">No objects found</p>
                            <p className="text-[9px] text-slate-600 max-w-[170px] mx-auto">Use the canvas tools or AR View to place items.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: walkthroughs */}
                {sidebarTab === 'walkthroughs' && (
                  <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto no-scrollbar animate-in fade-in duration-200">
                    <div className="space-y-1 block">
                      <h4 className="text-xs font-black uppercase text-brand-cyan tracking-widest">3D Room Walks</h4>
                      <p className="text-[10px] text-slate-400">View or execute high-fidelity interactive spatial representations of scanned chambers.</p>
                    </div>

                    <div className="space-y-3">
                      {(project.roomScans && project.roomScans.length > 0) ? (
                        project.roomScans.map((scan) => (
                          <div 
                            key={scan.scanId}
                            className="bg-slate-950 border border-white/5 rounded-2xl p-4 space-y-3 hover:border-brand-cyan/40 transition-colors animate-in fade-in"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="text-xs font-bold text-white uppercase tracking-wider">{scan.roomName}</h5>
                                <span className="text-[9px] font-mono text-slate-500">Scan ID: ...{scan.scanId.slice(-6)}</span>
                              </div>
                              <span className="text-[9px] bg-slate-900 border border-white/10 text-emerald-400 font-black px-2 py-0.5 rounded-full">
                                {scan.dimensions?.sqft ? `${scan.dimensions.sqft} SQ.FT` : 'Dimensions Pending'}
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2 py-1.5 border-y border-white/5 font-mono text-[9px] text-slate-400">
                              <div>
                                <span className="text-[8px] text-slate-600 uppercase block">Width</span>
                                <span>{scan.dimensions?.width?.toFixed(1) || '0.0'} ft</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-600 uppercase block">Length</span>
                                <span>{scan.dimensions?.length?.toFixed(1) || '0.0'} ft</span>
                              </div>
                              <div>
                                <span className="text-[8px] text-slate-600 uppercase block">Height</span>
                                <span>{scan.dimensions?.height?.toFixed(1) || '0.0'} ft</span>
                              </div>
                            </div>

                            {scan.materials && (
                              <div className="space-y-1 text-[9px] text-slate-400">
                                <span className="text-[8px] text-slate-600 uppercase font-black block tracking-wider">A.I. Extracted Materials</span>
                                <div className="flex flex-wrap gap-1">
                                  {(scan.materials as any).flooring && <span className="bg-white/5 text-slate-300 px-1.5 py-0.5 rounded border border-white/5">{(scan.materials as any).flooring}</span>}
                                  {(scan.materials as any).wall && <span className="bg-white/5 text-slate-300 px-1.5 py-0.5 rounded border border-white/5">{(scan.materials as any).wall}</span>}
                                  {(scan.materials as any).trim && <span className="bg-white/5 text-slate-300 px-1.5 py-0.5 rounded border border-white/5">{(scan.materials as any).trim}</span>}
                                </div>
                              </div>
                            )}

                            <button
                              onClick={() => setSelectedWalkthrough(scan)}
                              className="w-full py-2 bg-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan hover:text-slate-900 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center space-x-2"
                            >
                              <Play size={10} fill="currentColor" />
                              <span>Execute Walkthrough</span>
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-6 text-center space-y-4">
                          <div className="w-12 h-12 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center text-slate-600 mx-auto">
                            <Box size={20} className="animate-pulse" />
                          </div>
                          <div className="space-y-1">
                            <h5 className="text-xs font-bold text-slate-400">No 3D Models Present</h5>
                            <p className="text-[9px] text-slate-600 max-w-[190px] mx-auto">This project contains no active AR laser scans or depth maps files yet.</p>
                          </div>
                          <button
                            onClick={() => {
                              const demoScan: RoomScan = {
                                scanId: `scan-${Date.now()}`,
                                roomName: 'Basement Room A',
                                floorPlanSvg: '',
                                dimensions: { length: 14, width: 12, height: 8, sqft: 168 },
                                placedPhotos: [],
                                materials: {
                                  flooring: 'Red Oak Hardwood',
                                  wall: 'Gypsum Wood Paneling',
                                  trim: 'Pine Moldings'
                                } as any
                              };
                              onUpdate({ roomScans: [...(project.roomScans || []), demoScan] });
                              EventBus.publish('com.restorationai.project.updated', { projectId: project.id }, project.id, 'Demo scan model successfully created', 'success');
                            }}
                            className="bg-brand-cyan text-slate-900 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-cyan-400 transition-colors mx-auto block"
                          >
                            Generate Demo 3D Scan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 3: ai-capture */}
                {sidebarTab === 'ai-capture' && (
                  <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto no-scrollbar animate-in fade-in duration-200">
                    <div className="space-y-1 block">
                      <h4 className="text-xs font-black uppercase text-brand-cyan tracking-widest">A.I. & Optics Calibration</h4>
                      <p className="text-[10px] text-slate-400">Calibrate automatic shape sensing threshold and computer vision tracking mechanisms.</p>
                    </div>

                    {/* Auto Capture Toggle */}
                    <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Auto Snapshots</span>
                          <span className="text-xs font-bold text-white">Capture on Movement</span>
                        </div>
                        <button
                          onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
                          className={`w-10 h-6 rounded-full p-1 transition-colors ${autoCaptureEnabled ? 'bg-brand-cyan' : 'bg-slate-800'}`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoCaptureEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <p className="text-[9px] text-slate-600">Triggers automatic viewport canvas photography when significant device pan tracking is detected.</p>
                    </div>

                    {/* Threshold setting */}
                    <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 space-y-4">
                      <div className="space-y-1.5 block">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Sensing Threshold</span>
                          <span className="text-xs font-mono font-bold text-brand-cyan">{arThreshold}%</span>
                        </div>
                        <p className="text-[9px] text-slate-600">Minimum structural contrast score needed for automatic shape prediction and point suggesting.</p>
                      </div>

                      <div className="space-y-2 block">
                        <input 
                          type="range"
                          min="50"
                          max="95"
                          value={arThreshold}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setArThreshold(val);
                            EventBus.publish('com.restorationai.calibration', { threshold: val }, project.id, `Confidence threshold adjusted to ${val}%`, 'info');
                          }}
                          className="w-full accent-brand-cyan cursor-pointer bg-slate-900 rounded-lg appearance-none h-1.5"
                        />
                        <div className="flex justify-between text-[8px] font-mono text-slate-600 uppercase">
                          <span>Low (Dense Sug.)</span>
                          <span>High (Safe Match)</span>
                        </div>
                      </div>

                      <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5 font-sans">
                        <div className="flex justify-between items-center text-[9px]">
                          <span className="text-slate-500">Suggested Candidates:</span>
                          <span className="font-mono text-white font-bold">
                            {arThreshold > 85 ? '1 Match' : arThreshold > 70 ? '3 Matches' : '7 Matches'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* System Telemetry diagnostics */}
                    <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 space-y-2 font-mono text-[9px]">
                      <span className="text-[8px] font-black font-sans text-slate-500 uppercase tracking-widest block mb-2">Internal Real-Time Telemetry</span>
                      
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">IMU GYROSCOPE:</span>
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span> CALIBRATED
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">SPATIAL CHOP:</span>
                        <span className="text-white">120.4 FPS (LIDAR)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">OPTICAL BRIGHTNESS:</span>
                        <span className="text-amber-400 font-bold">480 LUX (EXCELLENT)</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">ESTIMATED DEWPOINT:</span>
                        <span className="text-cyan-400 font-bold">54.2 °F (LOCAL TEMP)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-shrink-0 p-6 bg-slate-950/50 backdrop-blur-md border-t border-white/5">
            <button 
              onClick={manualCapture}
              className="w-full py-4 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-3 shadow-xl shadow-brand-cyan/20 transition-all active:scale-95"
            >
              <Camera size={18} />
              <span>Capture AR Snapshot</span>
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-950">
              <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center">
                <Settings size={16} className="mr-2 text-brand-cyan" />
                AR Visibility Settings
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-1.5 bg-white/5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-white/5">
                <div className="flex items-center space-x-3">
                  <MapPin size={18} className="text-slate-400" />
                  <span className="text-sm font-bold text-white">Point Markers</span>
                </div>
                <button 
                  onClick={() => setVisibility(prev => ({ ...prev, markers: !prev.markers }))}
                  className={`p-2 rounded-lg transition-all ${visibility.markers ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-white/5 text-slate-500'}`}
                >
                  {visibility.markers ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-white/5">
                <div className="flex items-center space-x-3">
                  <Layers size={18} className="text-slate-400" />
                  <span className="text-sm font-bold text-white">Mapped Areas</span>
                </div>
                <button 
                  onClick={() => setVisibility(prev => ({ ...prev, areas: !prev.areas }))}
                  className={`p-2 rounded-lg transition-all ${visibility.areas ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-white/5 text-slate-500'}`}
                >
                  {visibility.areas ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-white/5">
                <div className="flex items-center space-x-3">
                  <Box size={18} className="text-slate-400" />
                  <span className="text-sm font-bold text-white">Bounding Box</span>
                </div>
                <button 
                  onClick={() => setVisibility(prev => ({ ...prev, boundingBox: !prev.boundingBox }))}
                  className={`p-2 rounded-lg transition-all ${visibility.boundingBox ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-white/5 text-slate-500'}`}
                >
                  {visibility.boundingBox ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-white/5">
                <div className="flex items-center space-x-3">
                  <Crosshair size={18} className="text-slate-400" />
                  <span className="text-sm font-bold text-white">Measurements</span>
                </div>
                <button 
                  onClick={() => setVisibility(prev => ({ ...prev, measurements: !prev.measurements }))}
                  className={`p-2 rounded-lg transition-all ${visibility.measurements ? 'bg-brand-cyan/20 text-brand-cyan' : 'bg-white/5 text-slate-500'}`}
                >
                  {visibility.measurements ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-950 border-t border-white/5">
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Shape/Marker Configuration Modals */}
      {isConfiguringMarker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Place Marker</h3>
              <button onClick={() => setIsConfiguringMarker(null)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-widest">Select Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'damage', label: 'Damage', icon: <AlertTriangle size={16} /> },
                    { id: 'equipment', label: 'Equipment', icon: <Power size={16} /> },
                    { id: 'moisture', label: 'Moisture', icon: <Thermometer size={16} /> },
                    { id: 'note', label: 'Note', icon: <PenTool size={16} /> }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setDraftMarkerType(t.id as 'equipment' | 'damage' | 'moisture' | 'note')}
                      className={`flex items-center justify-center space-x-2 py-3 rounded-xl border transition-colors ${draftMarkerType === t.id ? 'bg-brand-cyan/20 border-brand-cyan text-brand-cyan' : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                      {t.icon}
                      <span className="text-xs font-bold">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex space-x-3">
              <button onClick={() => setIsConfiguringMarker(null)} className="flex-1 py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={confirmMarker} className="flex-1 py-3 rounded-xl bg-brand-cyan text-slate-900 text-xs font-bold uppercase hover:bg-cyan-400 transition-colors tracking-widest">Confirm Location</button>
            </div>
          </div>
        </div>
      )}

      {isConfiguringArea && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Save Polygon Area</h3>
              <button onClick={() => setIsConfiguringArea(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-widest">Select Classification</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'affected', label: 'Affected', color: 'bg-red-500' },
                    { id: 'mitigated', label: 'Mitigated', color: 'bg-green-500' },
                    { id: 'safe', label: 'Safe', color: 'bg-blue-500' },
                    { id: 'containment', label: 'Containment', color: 'bg-yellow-500' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setDraftAreaType(t.id as 'affected' | 'mitigated' | 'safe' | 'containment')}
                      className={`flex items-center space-x-2 py-3 px-3 rounded-xl border transition-colors ${draftAreaType === t.id ? 'bg-white/10 border-white text-white' : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                      <span className={`w-3 h-3 rounded-full ${t.color}`} />
                      <span className="text-xs font-bold">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex space-x-3">
              <button onClick={() => setIsConfiguringArea(false)} className="flex-1 py-3 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Resume Drawing</button>
              <button onClick={confirmArea} className="flex-1 py-3 rounded-xl bg-brand-cyan text-slate-900 text-xs font-bold uppercase hover:bg-cyan-400 transition-colors tracking-widest">Save Area</button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Picker Modal */}
      {photoPickerFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-950">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Camera size={20} className="text-brand-cyan" /> Select Photo to Link
              </h3>
              <button onClick={() => setPhotoPickerFor(null)} className="text-slate-500 hover:text-white"><X size={20} /></button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 bg-slate-900/50">
              {capturedPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="w-16 h-16 rounded-3xl bg-slate-950 border border-white/5 flex items-center justify-center text-slate-700">
                    <Camera size={32} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-400">No AR Snapshots</p>
                    <p className="text-[10px] text-slate-600 max-w-[220px]">Switch to AR view and capture snapshots to link them with markers and areas.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                  {capturedPhotos.map(photo => {
                    // Check if already linked
                    const targetObj = photoPickerFor.type === 'marker' ? selectedMarker : selectedArea;
                    const isLinked = targetObj?.linkedPhotos?.includes(photo.id);

                    if (isLinked) return null; // Hide already linked
                    
                    return (
                      <button
                        key={photo.id}
                        onClick={() => {
                          const target = photoPickerFor.type === 'marker' ? selectedMarker : selectedArea;
                          if (!target) return;
                          const currentLinks = target.linkedPhotos || [];
                          const newLinks = [...currentLinks, photo.id];
                          
                          if (photoPickerFor.type === 'marker') {
                            updateMarker(target.id, { linkedPhotos: newLinks });
                            setSelectedMarker({ ...(target as ARMarker), linkedPhotos: newLinks });
                          } else {
                            updateArea(target.id, { linkedPhotos: newLinks });
                            setSelectedArea({ ...(target as ARArea), linkedPhotos: newLinks });
                          }
                          setPhotoPickerFor(null);
                        }}
                        className="group relative aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-brand-cyan hover:ring-2 hover:ring-brand-cyan/50 focus:outline-none transition-all text-left bg-slate-950"
                      >
                        {photo.url ? (
                          <img src={photo.url} alt="AR Snapshot" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-700 bg-slate-900">
                            <Camera size={24} />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                            <div className="text-[9px] font-black uppercase text-white tracking-widest truncate">{photo.zone}</div>
                            <div className="text-[8px] text-slate-300 font-mono">{new Date(photo.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedWalkthrough && (
        <WalkthroughViewer scan={selectedWalkthrough} onClose={() => setSelectedWalkthrough(null)} />
      )}
    </div>
  );
};

export default ARMapping;
