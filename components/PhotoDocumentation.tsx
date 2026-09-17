
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
    Camera, Loader2, Sparkles, BrainCircuit, 
    Video, X, Upload, Play, Mic, MicOff
} from 'lucide-react';
import { blobToBase64 } from '../utils/photoutils';
import { useAppContext } from '../context/AppContext';
import { Project, Photo } from '../types';
import { AIRouterClient } from '../services/AIRouterClient';
import { EventBus } from '../services/EventBus';
import { uploadMedia } from '../services/api';
import VideoLogger from './VideoLogger';
import ImageAnnotator from './ImageAnnotator';
import WaterMitigationDocumentation from './WaterMitigationDocumentation';

interface PhotoDocumentationProps {
  onStartScan: () => void;
  isMobile?: boolean;
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

const SUGGESTED_TAGS = {
  'Status / Assessment': ['pre-existing damage', 'moisture reading', 'equipment setup'],
  'Mitigation Tasks': ['Water Extraction', 'Containment Setup', 'Demo / Tear Out', 'Antimicrobial Application', 'Debris Removal'],
  'Water Loss': ['Water Loss', 'Source of Loss', 'Affected Area'],
  'Water Category': ['Category 1', 'Category 2', 'Category 3'],
  'Materials': ['Drywall', 'Carpet', 'Pad', 'Subfloor', 'Hardwood', 'Baseboard', 'Insulation', 'Cabinet'],
  'Equipment': ['Air Mover', 'Air Handler', 'Dehumidifier', 'HEPA Scrubber', 'Heater'],
  'Moisture Meters': ['Pin Meter', 'Pinless Meter', 'Hammer Probe', 'Hygrometer', 'Thermal Camera']
};

type TabType = 'gallery' | 'mitigation' | 'generate' | 'edit' | 'video';
type PhotoItem = Photo & { type: 'image' | 'video' };

const PhotoDocumentation: React.FC<PhotoDocumentationProps> = ({ project, onUpdate }) => {
  const { isOnline, accessToken } = useAppContext();
  const [activeTab, setActiveTab] = useState<TabType>('gallery');
  const [filter, setFilter] = useState('All');
  const [loadingPhotos, setLoadingPhotos] = useState<Set<string>>(new Set());
  const [photoInsights, setPhotoInsights] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [customTag, setCustomTag] = useState('');
  
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [uploadSection, setUploadSection] = useState('Initial Damage');
  const [isRecordingDictation, setIsRecordingDictation] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  const updateNotesRef = useRef<((id: string, notes: string) => void) | null>(null);
  
  const handleSaveAnnotation = async (dataUrl: string) => {
    if (!selectedPhoto) return;
    try {
      // In a real app we'd upload the new dataUrl (base64) to storage
      // For this mock, we just update the photo URL
      const updatedProject = { ...project };
      for (const room of updatedProject.rooms) {
        const photoIdx = room.photos.findIndex(p => p.id === selectedPhoto.id);
        if (photoIdx !== -1) {
          room.photos[photoIdx] = {
            ...room.photos[photoIdx],
            url: dataUrl
          };
          break;
        }
      }
      onUpdate?.(updatedProject);
      setSelectedPhoto({ ...selectedPhoto, url: dataUrl });
      setIsAnnotating(false);
      EventBus.publish('com.restorationai.log.entry', { message: 'Photo annotated', category: 'Documentation' }, project.id, 'Photo Annotated', 'success');
    } catch (err) {
      console.error(err);
    }
  };
  
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
      return () => {
          if (cameraStream) {
              cameraStream.getTracks().forEach(track => track.stop());
          }
      };
  }, [cameraStream]);

  useEffect(() => {
      // Initialize SpeechRecognition if available
      const _window = window as typeof window & { webkitSpeechRecognition?: unknown, SpeechRecognition?: unknown };
      const SpeechRecognitionImpl = _window.SpeechRecognition || _window.webkitSpeechRecognition;
      if (typeof SpeechRecognitionImpl === 'function') {
          // @ts-expect-error - SpeechRecognition is not fully typed
          recognitionRef.current = new SpeechRecognitionImpl();
          if (recognitionRef.current) {
              recognitionRef.current.continuous = true;
              recognitionRef.current.interimResults = true;
              
              recognitionRef.current.onresult = (event: any) => {
                  let finalTranscript = '';
                  for (let i = event.resultIndex; i < event.results.length; ++i) {
                      if (event.results[i].isFinal) {
                          finalTranscript += event.results[i][0].transcript + ' ';
                      }
                  }
                  if (finalTranscript && selectedPhoto && updateNotesRef.current) {
                      updateNotesRef.current(selectedPhoto.id, selectedPhoto.notes ? `${selectedPhoto.notes}\n${finalTranscript}` : finalTranscript);
                  }
              };
              
              recognitionRef.current.onerror = (event: any) => {
                  console.error("Speech recognition error", event.error);
                  setIsRecordingDictation(false);
              };
              
              recognitionRef.current.onend = () => {
                  setIsRecordingDictation(false);
              };
          }
      }
      
      const projectPhotos: PhotoItem[] = [
          ...project.rooms.flatMap(room => 
              room.photos.map(p => ({ ...p, type: 'image' as const }))
          ),
          ...(project.videos || []).map(v => ({
              id: v.id,
              url: v.url,
              thumbnailUrl: v.thumbnail,
              timestamp: v.timestamp,
              notes: v.description,
              tags: v.tags || [],
              type: 'video' as const,
              roomId: 'unknown'
          } as unknown as PhotoItem))
      ];
      setPhotos(projectPhotos);
      
      return () => {
          if (recognitionRef.current) {
              recognitionRef.current.stop();
          }
      };
  }, [project, selectedPhoto]);
  
  const toggleDictation = () => {
      if (!recognitionRef.current) {
          alert('Speech Recognition is not supported in this browser.');
          return;
      }
      
      if (isRecordingDictation) {
          recognitionRef.current.stop();
          setIsRecordingDictation(false);
      } else {
          try {
              recognitionRef.current.start();
              setIsRecordingDictation(true);
          } catch (e) {
              console.error(e);
          }
      }
  };

  const persistTags = useCallback((photoId: string, newTags: string[]) => {
    if (!onUpdate) return;
    
    let isVideo = false;
    const updatedRooms = project.rooms.map(room => ({
        ...room,
        photos: room.photos.map(p => {
          if (p.id === photoId) return { ...p, tags: newTags };
          return p;
        })
    }));
    
    const updatedVideos = (project.videos || []).map(v => {
      if (v.id === photoId) {
        isVideo = true;
        return { ...v, tags: newTags };
      }
      return v;
    });
    
    if (isVideo) {
      onUpdate({ videos: updatedVideos });
    } else {
      onUpdate({ rooms: updatedRooms });
    }
  }, [onUpdate, project.rooms, project.videos]);

  const persistNotes = useCallback((photoId: string, newNotes: string) => {
    if (!onUpdate) return;
    
    let isVideo = false;
    const updatedRooms = project.rooms.map(room => ({
        ...room,
        photos: room.photos.map(p => {
          if (p.id === photoId) return { ...p, notes: newNotes };
          return p;
        })
    }));
    
    const updatedVideos = (project.videos || []).map(v => {
      if (v.id === photoId) {
        isVideo = true;
        return { ...v, description: newNotes };
      }
      return v;
    });
    
    if (isVideo) {
      onUpdate({ videos: updatedVideos });
    } else {
      onUpdate({ rooms: updatedRooms });
    }
  }, [onUpdate, project.rooms, project.videos]);

  const persistLink = useCallback((photoId: string, field: 'linkedRoomId' | 'linkedTaskId' | 'linkedEquipmentId', value: string) => {
    if (!onUpdate) return;
    
    let isVideo = false;
    const updatedRooms = project.rooms.map(room => ({
        ...room,
        photos: room.photos.map(p => {
          if (p.id === photoId) return { ...p, [field]: value };
          return p;
        })
    }));
    
    const updatedVideos = (project.videos || []).map(v => {
      if (v.id === photoId) {
        isVideo = true;
        return { ...v, [field]: value };
      }
      return v;
    });
    
    if (isVideo) {
      onUpdate({ videos: updatedVideos });
    } else {
      onUpdate({ rooms: updatedRooms });
    }
  }, [onUpdate, project.rooms, project.videos]);

  const updateLink = (photoId: string, field: 'linkedRoomId' | 'linkedTaskId' | 'linkedEquipmentId', value: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.id === photoId) {
        const updated = { ...p, [field]: value };
        if (selectedPhoto?.id === photoId) {
          setSelectedPhoto(updated);
        }
        persistLink(photoId, field, value);
        return updated;
      }
      return p;
    }));
  };

  const updateNotes = useCallback((photoId: string, notes: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.id === photoId) {
        const updated = { ...p, notes };
        if (selectedPhoto?.id === photoId) {
          setSelectedPhoto(updated);
        }
        persistNotes(photoId, notes);
        return updated;
      }
      return p;
    }));
  }, [selectedPhoto, persistNotes]);

  // Use a ref for updateNotes to avoid stale closures in SpeechRecognition without triggering unnecessary re-renders
  useEffect(() => {
    updateNotesRef.current = updateNotes;
  }, [updateNotes]);

  const toggleTag = (photoId: string, tag: string) => {
    setPhotos(prev => prev.map(p => {
      if (p.id === photoId) {
        const hasTag = p.tags.includes(tag);
        const newTags = hasTag 
          ? p.tags.filter(t => t !== tag)
          : [...p.tags, tag];
        
        const updated = { ...p, tags: newTags };
        if (selectedPhoto?.id === photoId) {
          setSelectedPhoto(updated);
        }
        persistTags(photoId, newTags);
        return updated;
      }
      return p;
    }));
  };

  const addCustomTag = (photoId: string) => {
    if (!customTag.trim()) return;
    toggleTag(photoId, customTag.trim());
    setCustomTag('');
  };

  // Filtering Logic
  const filteredPhotos = useMemo(() => {
    return photos.filter(p => {
        const matchesTag = filter === 'All' || p.tags.includes(filter);
        return matchesTag;
    });
  }, [photos, filter]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    photos.forEach(p => p.tags.forEach(t => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [photos]);

  const handleAnalyzePhoto = async (photo: PhotoItem) => {
    if (!isOnline || !accessToken) return;
    setLoadingPhotos(prev => new Set(prev).add(photo.id));
    
    try {
      const router = new AIRouterClient();
      const imgResponse = await fetch(photo.url);
      if (!imgResponse.ok) {
          throw new Error(`Cannot load image (HTTP ${imgResponse.status}). It may have been deleted or expired.`);
      }
      const blob = await imgResponse.blob();
      const base64Data = await blobToBase64(blob);

      const response = await router.analyzeWaterDamageImage(base64Data, project.aiLearnings || []);

      const result = JSON.parse(response.text || '{}');
      if (result.insight) {
          setPhotoInsights(prev => ({ ...prev, [photo.id]: result.insight }));
          
          // Automatically generate a concise note based on the 'insight' field
          setPhotos(prev => prev.map(p => {
              if (p.id === photo.id) {
                  const updated = { 
                      ...p, 
                      aiInsight: result.insight,
                      notes: `AI Analysis: ${result.insight}
${result.waterCategory ? `Category: ${result.waterCategory}` : ''}
${result.meterReading ? `Meter: ${result.meterReading}` : ''}
${result.affectedAreaEstimate ? `Area: ${result.affectedAreaEstimate}` : ''}`,
                      tags: [...new Set([...p.tags, ...(result.tags || [])])],
                      meterReading: result.meterReading,
                      waterCategory: result.waterCategory,
                      affectedAreaEstimate: result.affectedAreaEstimate,
                      damagedMaterials: result.damagedMaterials,
                      mitigationSteps: result.mitigationSteps
                  };
                  if (selectedPhoto?.id === photo.id) {
                      setSelectedPhoto(updated);
                  }
                  return updated;
              }
              return p;
          }));

          EventBus.publish('com.restorationai.log.entry', { message: `AI Insight for photo: ${result.insight}`, category: 'AI Vision' }, project.id, 'AI Insight Generated', 'info');
      }
      EventBus.publish('com.restorationai.notification', { title: 'Photo Analyzed', message: 'AI tagging complete' }, project.id, 'AI Tagging Complete', 'success');

    } catch (err) {
      console.error(err);
      EventBus.publish('com.restorationai.notification', { title: 'Analysis Failed', message: 'Could not process photo' }, project.id, 'Photo Analysis Failed', 'error');
    } finally {
      setLoadingPhotos(prev => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
      });
    }
  };

  const handleSaveLearning = async () => {
    if (!selectedPhoto) return;
    try {
      const imgResponse = await fetch(selectedPhoto.url);
      const blob = await imgResponse.blob();
      const base64Data = await blobToBase64(blob);

      const newLearning = {
          photoId: selectedPhoto.id,
          imageBase64: base64Data,
          timestamp: Date.now(),
          correctedData: {
              waterCategory: selectedPhoto.waterCategory,
              affectedAreaEstimate: selectedPhoto.affectedAreaEstimate,
              damagedMaterials: selectedPhoto.damagedMaterials || [],
              mitigationSteps: selectedPhoto.mitigationSteps || [],
              meterReading: selectedPhoto.meterReading,
              tags: selectedPhoto.tags,
              insight: selectedPhoto.aiInsight || selectedPhoto.notes
          }
      };

      const updatedLearnings = [...(project.aiLearnings || []), newLearning];
      onUpdate?.({ aiLearnings: updatedLearnings });
      EventBus.publish('com.restorationai.notification', { title: 'Learning Example Saved', message: 'The AI will use this feedback for future analysis.' }, project.id, 'Feedback Tracked', 'success');
    } catch (err) {
      console.error(err);
      EventBus.publish('com.restorationai.notification', { title: 'Error', message: 'Could not save learning.' }, project.id, 'Error', 'error');
    }
  };

  const generateVideoThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        video.currentTime = 1; // Capture at 1 second
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (canvas.width > 0 && canvas.height > 0) {
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg'));
        } else {
            resolve('');
        }
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newItems: PhotoItem[] = [];

    let geolocation: { lat: number, lng: number } | undefined;
    if ('geolocation' in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
        });
        geolocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
      } catch (err) {
          console.warn("Geolocation not available or denied", err);
      }
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isVideo = file.type.startsWith('video/');
      
      let url = URL.createObjectURL(file);
      try {
        const uploadedUrl = await uploadMedia(project.id, file);
        if (uploadedUrl) {
          url = uploadedUrl;
        }
      } catch (err) {
        console.error("Failed to upload media to cloud storage", err);
      }
      
      let thumbnailUrl: string | undefined;

      if (isVideo) {
        thumbnailUrl = await generateVideoThumbnail(file);
      }

      const newItem: PhotoItem = {
        id: `media-${Date.now()}-${i}`,
        url: url,
        thumbnailUrl: thumbnailUrl,
        timestamp: Date.now(),
        geolocation: geolocation,
        tags: [uploadSection, 'Uploaded'],
        notes: `${uploadSection}: Uploaded ${isVideo ? 'video' : 'photo'}`,
        type: isVideo ? 'video' : 'image'
      };
      newItems.push(newItem);
    }

    setPhotos(prev => [...newItems, ...prev]);
    
    if (onUpdate) {
        const updatedRooms = [...project.rooms];
        if (updatedRooms.length === 0) {
            updatedRooms.push({
                id: `room-${Date.now()}`,
                name: 'General',
                dimensions: { length: 0, width: 0, height: 0 },
                readings: [],
                photos: [],
                status: 'wet'
            });
        }
        updatedRooms[0] = {
            ...updatedRooms[0],
            photos: [...newItems, ...updatedRooms[0].photos]
        };
        onUpdate({ rooms: updatedRooms });
    }

    setIsProcessing(false);
    EventBus.publish('com.restorationai.log.entry', { message: `${newItems.length} media items uploaded`, category: 'Documentation' }, project.id, 'Media Uploaded', 'info');

    // Trigger AI analysis for the newly uploaded images
    newItems.forEach(item => {
        if (item.type === 'image') {
            handleAnalyzePhoto(item);
        }
    });
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setCameraStream(stream);
      setShowCamera(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const takePhoto = async () => {
      if (!videoRef.current) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      stopCamera();

      let geolocation: { lat: number, lng: number } | undefined;
      if ('geolocation' in navigator) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
          });
          geolocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
        } catch (err) {
            console.warn("Geolocation not available or denied", err);
        }
      }

      let url = dataUrl;
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
        const uploadedUrl = await uploadMedia(project.id, file);
        if (uploadedUrl) {
            url = uploadedUrl;
        }
      } catch(err) {
        console.error("Error uploading captured photo", err);
      }

      const newPhoto: PhotoItem = {
          id: `p-${Date.now()}`,
          url: url,
          timestamp: Date.now(),
          geolocation,
          tags: [uploadSection, 'Captured'],
          notes: `${uploadSection}: New site photo captured`,
          type: 'image'
      };
      
      setPhotos(prev => [newPhoto, ...prev]);
      
      if (onUpdate) {
          const updatedRooms = [...project.rooms];
          if (updatedRooms.length === 0) {
              updatedRooms.push({
                  id: `room-${Date.now()}`,
                  name: 'General',
                  dimensions: { length: 0, width: 0, height: 0 },
                  readings: [],
                  photos: [],
                  status: 'wet'
              });
          }
          updatedRooms[0] = {
              ...updatedRooms[0],
              photos: [newPhoto, ...updatedRooms[0].photos]
          };
          onUpdate({ rooms: updatedRooms });
      }
      EventBus.publish('com.restorationai.log.entry', { message: 'New site photo captured', category: 'Documentation' }, project.id, 'New Photo Captured', 'info');
      
      // Trigger AI analysis for the newly captured image
      handleAnalyzePhoto(newPhoto);
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">
        <header className="p-4 bg-slate-900 border-b border-white/5 flex justify-between items-center sticky top-0 z-10">
            <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveTab('gallery')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeTab === 'gallery' ? 'bg-brand-cyan text-slate-900' : 'bg-white/5 text-slate-400'}`}>Gallery</button>
                <button onClick={() => setActiveTab('mitigation')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${activeTab === 'mitigation' ? 'bg-[#00d4aa] text-slate-950 font-black shadow-[0_0_15px_rgba(0,212,170,0.3)]' : 'bg-white/5 text-slate-400 hover:text-white'}`}>
                  <Sparkles size={12} className={activeTab === 'mitigation' ? 'text-slate-950' : 'text-[#00d4aa]'} />
                  <span>AI Mitigation Assessment</span>
                  <span className="text-[9px] px-1.5 py-0.2 bg-black/20 rounded font-bold uppercase">S500</span>
                </button>
                <button onClick={() => setActiveTab('generate')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${activeTab === 'generate' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-400'}`}><Sparkles size={12}/><span>AI Gen</span></button>
                <button onClick={() => setActiveTab('video')} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${activeTab === 'video' ? 'bg-purple-500 text-white' : 'bg-white/5 text-slate-400'}`}><Video size={12}/><span>Video Logs</span></button>
            </div>
            <div className="flex items-center space-x-2">
                <select
                    value={uploadSection}
                    onChange={(e) => setUploadSection(e.target.value)}
                    className="bg-slate-900 border border-white/10 text-xs font-bold text-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-cyan max-w-[120px] truncate"
                >
                    <option value="Initial Damage">Initial Damage</option>
                    <option value="Drying Process">Drying Process</option>
                    <option value="Final Outcome">Final Outcome</option>
                    <option value="Equipment Setup">Equipment Setup</option>
                </select>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept="image/*,video/*" 
                    multiple 
                    className="hidden" 
                />
                <button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isProcessing}
                    className="p-2 bg-white/5 text-slate-400 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
                    title="Upload Media"
                >
                    {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20}/>}
                </button>
                <button onClick={startCamera} className="p-2 bg-brand-cyan text-slate-900 rounded-full shadow-lg active:scale-95 transition-transform"><Camera size={20}/></button>
            </div>
        </header>

        {showCamera && (
          <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            <div className="p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
              <div className="text-white font-bold">Capture Image</div>
              <button onClick={stopCamera} className="p-2 text-white bg-white/10 rounded-full hover:bg-white/20">
                <X size={20} />
              </button>
            </div>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="flex-1 w-full h-full object-cover"
              onCanPlay={() => {
                if (videoRef.current && cameraStream) {
                    videoRef.current.play();
                }
              }}
            />
            <div className="absolute bottom-0 w-full p-8 flex justify-center bg-gradient-to-t from-black/80 to-transparent">
              <button 
                onClick={takePhoto}
                className="w-16 h-16 rounded-full border-4 border-white bg-white/20 active:bg-white/50 transition-colors"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'gallery' && (
                <>
                    {/* AI Mitigation Action Banner */}
                    <div className="mb-4 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-[#00d4aa]/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-[#00d4aa]/10 border border-[#00d4aa]/30 flex items-center justify-center text-[#00d4aa]">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <div className="flex items-center space-x-2">
                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">AI Water Mitigation Assessment & Quantification</h3>
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/20">IICRC S500</span>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">Analyze uploaded photos & videos to quantify damaged materials, calculate SF/LF flood cuts, and generate preliminary damage reports.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setActiveTab('mitigation')}
                            className="px-4 py-2 bg-[#00d4aa] hover:bg-[#00d4aa]/90 text-slate-950 text-xs font-black rounded-xl shadow-[0_0_15px_rgba(0,212,170,0.3)] transition-all active:scale-95"
                        >
                            Launch Assessment Module
                        </button>
                    </div>

                    <div className="mb-4 flex space-x-2 overflow-x-auto no-scrollbar pb-2">
                        {allTags.map(tag => (
                            <button key={tag} onClick={() => setFilter(tag)} className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap border transition-all ${filter === tag ? 'bg-white text-slate-900 border-white' : 'bg-transparent text-slate-500 border-slate-700'}`}>{tag}</button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {filteredPhotos.map(photo => (
                            <div 
                                key={photo.id} 
                                className="relative group rounded-2xl overflow-hidden aspect-square bg-slate-900 border border-white/10 cursor-pointer"
                                onClick={() => setSelectedPhoto(photo)}
                            >
                                <img 
                                    src={photo.type === 'video' ? (photo.thumbnailUrl || photo.url) : photo.url} 
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105" 
                                    loading="lazy" 
                                />
                                {photo.type === 'video' && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                                        <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 text-white">
                                            <Play size={24} fill="currentColor" />
                                        </div>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                    <p className="text-xs text-white font-medium truncate">{photo.notes}</p>
                                    <div className="flex space-x-2 mt-2">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleAnalyzePhoto(photo); }} 
                                            disabled={loadingPhotos.has(photo.id)} 
                                            className="p-2 bg-indigo-600 rounded-lg text-white disabled:opacity-50"
                                        >
                                            {loadingPhotos.has(photo.id) ? <Loader2 size={14} className="animate-spin"/> : <BrainCircuit size={14} />}
                                        </button>
                                    </div>
                                </div>
                                {photoInsights[photo.id] && (
                                    <div className="absolute top-2 right-2 p-1.5 bg-indigo-500 rounded-full text-white shadow-lg animate-in zoom-in">
                                        <Sparkles size={12} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Photo/Video Detail Modal */}
                    {selectedPhoto && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
                            <div className="relative w-full max-w-4xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row">
                                <div className="flex-1 bg-black flex items-center justify-center min-h-[300px]">
                                    {selectedPhoto.type === 'video' ? (
                                        <video 
                                            src={selectedPhoto.url} 
                                            controls 
                                            autoPlay 
                                            className="w-full h-full"
                                        />
                                    ) : (
                                        isAnnotating && selectedPhoto.type === 'image' ? (
                                        <ImageAnnotator 
                                            imageUrl={selectedPhoto.url} 
                                            onSave={handleSaveAnnotation} 
                                            onCancel={() => setIsAnnotating(false)} 
                                        />
                                    ) : (
                                        <img 
                                            src={selectedPhoto.url} 
                                            className="max-w-full max-h-full object-contain transition-all duration-300"
                                        />
                                    )
                                    )}
                                </div>
                                <div className="w-full md:w-80 p-6 flex flex-col">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-xl font-bold text-white">Media Details</h3>
                                            <p className="text-xs text-slate-400 mt-1">
                                                {new Date(selectedPhoto.timestamp).toLocaleString()}
                                                {selectedPhoto.geolocation && ` • GPS: ${selectedPhoto.geolocation.lat.toFixed(6)}, ${selectedPhoto.geolocation.lng.toFixed(6)}`}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => setSelectedPhoto(null)}
                                            className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-full transition-colors"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="flex-1 space-y-6 overflow-y-auto pr-2">
                                        <div className="space-y-3 mb-6">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Associations</label>
                                            
                                            <div className="space-y-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 mb-1">Damage Area (Room)</span>
                                                    <select 
                                                        value={selectedPhoto.linkedRoomId || ''}
                                                        onChange={(e) => updateLink(selectedPhoto.id, 'linkedRoomId', e.target.value)}
                                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-brand-cyan transition-colors"
                                                    >
                                                        <option value="">None</option>
                                                        {project.rooms?.map(room => (
                                                            <option key={room.id} value={room.id}>{room.name}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 mb-1">Mitigation Task</span>
                                                    <select 
                                                        value={selectedPhoto.linkedTaskId || ''}
                                                        onChange={(e) => updateLink(selectedPhoto.id, 'linkedTaskId', e.target.value)}
                                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-brand-cyan transition-colors"
                                                    >
                                                        <option value="">None</option>
                                                        {project.tasks?.map(task => (
                                                            <option key={task.id} value={task.id}>{task.text}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex flex-col">
                                                    <span className="text-[10px] text-slate-400 mb-1">Equipment Used</span>
                                                    <select 
                                                        value={selectedPhoto.linkedEquipmentId || ''}
                                                        onChange={(e) => updateLink(selectedPhoto.id, 'linkedEquipmentId', e.target.value)}
                                                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-brand-cyan transition-colors"
                                                    >
                                                        <option value="">None</option>
                                                        {project.equipment?.map(eq => (
                                                            <option key={eq.id} value={eq.id}>{eq.type} - {eq.model}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">Active Tags</label>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {selectedPhoto.tags.length > 0 ? selectedPhoto.tags.map(tag => (
                                                    <button 
                                                        key={tag} 
                                                        onClick={() => toggleTag(selectedPhoto.id, tag)}
                                                        className="px-2 py-1 bg-brand-cyan/20 border border-brand-cyan/30 rounded-md text-[10px] font-bold text-brand-cyan flex items-center space-x-1 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-colors"
                                                    >
                                                        <span>{tag}</span>
                                                        <X size={10} />
                                                    </button>
                                                )) : (
                                                    <span className="text-[10px] text-slate-600 italic">No tags assigned</span>
                                                )}
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex space-x-2">
                                                    <input 
                                                        type="text"
                                                        value={customTag}
                                                        onChange={(e) => setCustomTag(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && addCustomTag(selectedPhoto.id)}
                                                        placeholder="Add custom tag..."
                                                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-brand-cyan transition-colors"
                                                    />
                                                    <button 
                                                        onClick={() => addCustomTag(selectedPhoto.id)}
                                                        className="px-3 py-2 bg-white/10 rounded-lg text-xs font-bold text-white hover:bg-white/20 transition-colors"
                                                    >
                                                        Add
                                                    </button>
                                                </div>

                                                <div className="space-y-3">
                                                    {Object.entries(SUGGESTED_TAGS).map(([category, tags]) => (
                                                        <div key={category}>
                                                            <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter mb-1 block">{category}</span>
                                                            <div className="flex flex-wrap gap-1">
                                                                {tags.map(tag => (
                                                                    <button 
                                                                        key={tag}
                                                                        onClick={() => toggleTag(selectedPhoto.id, tag)}
                                                                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all ${selectedPhoto.tags.includes(tag) ? 'bg-brand-cyan text-slate-900' : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/20'}`}
                                                                    >
                                                                        {tag}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">Notes & AI Insights</label>
                                              <button 
                                                onClick={toggleDictation}
                                                className={`p-1.5 rounded-full transition-all ${isRecordingDictation ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'}`}
                                                title="Voice Dictation"
                                              >
                                                {isRecordingDictation ? <MicOff size={14} /> : <Mic size={14} />}
                                              </button>
                                            </div>
                                            <div className="space-y-4">
                                                <textarea 
                                                    value={selectedPhoto.notes}
                                                    onChange={(e) => updateNotes(selectedPhoto.id, e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-slate-200 leading-relaxed outline-none focus:border-brand-cyan transition-colors min-h-[100px] resize-none"
                                                    placeholder="Add site notes or use dictation..."
                                                />
                                                {selectedPhoto.notes && /\b(mold|mould)\b/i.test(selectedPhoto.notes) && (
                                                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 animate-in fade-in duration-300">
                                                        💡 <strong>Guideline Advice:</strong> Please use the industry-standard term <strong>"microbial growth"</strong> instead of "mold" in documentation notes unless a formal third-party mold test has been certified.
                                                    </div>
                                                )}
                                                {selectedPhoto.aiInsight && (
                                                    <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
                                                        <div>
                                                            <div className="flex items-center space-x-2 text-indigo-400 mb-2">
                                                                <Sparkles size={14} />
                                                                <span className="text-[10px] font-black uppercase tracking-widest">AI Insight</span>
                                                            </div>
                                                            <p className="text-xs text-indigo-200/80 leading-relaxed mb-3">
                                                                {selectedPhoto.aiInsight}
                                                            </p>
                                                        </div>
                                                        
                                                        {(selectedPhoto.waterCategory || selectedPhoto.affectedAreaEstimate) && (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {selectedPhoto.waterCategory && (
                                                                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2">
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">Water Category</span>
                                                                        <span className="text-xs text-white break-words">{selectedPhoto.waterCategory}</span>
                                                                    </div>
                                                                )}
                                                                {selectedPhoto.affectedAreaEstimate && (
                                                                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2">
                                                                        <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">Affected Area</span>
                                                                        <span className="text-xs text-white break-words">{selectedPhoto.affectedAreaEstimate}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        
                                                        {selectedPhoto.damagedMaterials && selectedPhoto.damagedMaterials.length > 0 && (
                                                            <div>
                                                                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 block mb-1">Affected Materials</span>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {selectedPhoto.damagedMaterials.map((mat, idx) => (
                                                                        <span key={idx} className="bg-black/50 border border-white/10 rounded px-2 py-0.5 text-[10px] text-slate-300">
                                                                            {mat}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {selectedPhoto.mitigationSteps && selectedPhoto.mitigationSteps.length > 0 && (
                                                            <div>
                                                                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 block mb-2">Initial Mitigation Steps</span>
                                                                <ul className="space-y-1">
                                                                    {selectedPhoto.mitigationSteps.map((step, idx) => (
                                                                        <li key={idx} className="flex items-start space-x-2 text-xs text-indigo-200/80">
                                                                            <span className="text-indigo-500 font-bold mt-0.5">•</span>
                                                                            <span>{step}</span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
                                        <button 
                                            onClick={() => handleAnalyzePhoto(selectedPhoto)}
                                            disabled={loadingPhotos.has(selectedPhoto.id)}
                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                                        >
                                            {loadingPhotos.has(selectedPhoto.id) ? (
                                                <>
                                                    <Loader2 size={18} className="animate-spin" />
                                                    <span>Analyzing...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <BrainCircuit size={18} />
                                                    <span>{selectedPhoto.aiInsight ? 'Re-Analyze with AI' : 'Analyze Image with AI'}</span>
                                                </>
                                            )}
                                        </button>

                                        {selectedPhoto.aiInsight && (
                                            <button 
                                                onClick={handleSaveLearning}
                                                className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 text-white rounded-xl font-bold text-sm flex items-center justify-center space-x-2 transition-all"
                                            >
                                                <BrainCircuit size={18} className="text-brand-cyan" />
                                                <span>Save Corrections to Learning Model</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
            
            {activeTab === 'mitigation' && (
                <div className="h-full -m-4">
                    <WaterMitigationDocumentation 
                        project={project} 
                        onUpdateProject={onUpdate} 
                        onBack={() => setActiveTab('gallery')} 
                    />
                </div>
            )}

            {(activeTab === 'generate') && (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">Feature module simulated.</div>
            )}
            
            {activeTab === 'video' && (
                <VideoLogger project={project} onUpdate={onUpdate} />
            )}
        </div>
    </div>
  );
};

export default PhotoDocumentation;
