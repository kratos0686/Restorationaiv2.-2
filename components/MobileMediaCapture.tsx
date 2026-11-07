import React, { useRef, useState } from 'react';
import { Camera, Video, Loader2, X, Check, MapPin, Clock, FileText } from 'lucide-react';
import { Project, Photo, VideoLog } from '../types';
import { uploadMedia } from '../services/api';
import { EventBus } from '../services/EventBus';

interface MobileMediaCaptureProps {
    project: Project;
    onUpdateProject: (updates: Partial<Project>) => void;
    onClose?: () => void;
}

export default function MobileMediaCapture({ project, onUpdateProject, onClose }: MobileMediaCaptureProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewType, setPreviewType] = useState<'image' | 'video' | null>(null);
    const [capturedFile, setCapturedFile] = useState<File | null>(null);
    
    // Tagging state
    const [description, setDescription] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');

    const handleCaptureClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCapturedFile(file);
        setPreviewType(file.type.startsWith('video/') ? 'video' : 'image');
        setPreviewUrl(URL.createObjectURL(file));
        
        // Pre-fill some data if needed, wait for user confirmation
    };

    const handleCancel = () => {
        setPreviewUrl(null);
        setPreviewType(null);
        setCapturedFile(null);
        setDescription('');
        setSelectedRoom('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        if (!capturedFile) return;
        setIsProcessing(true);

        try {
            // 1. Get Geolocation
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
                    console.warn("Geolocation not available", err);
                }
            }

            // 2. Upload Media
            const uploadedUrl = await uploadMedia(project.id, capturedFile) || URL.createObjectURL(capturedFile);
            
            const timestamp = Date.now();
            const mediaId = `media-${timestamp}`;

            // 3. Save as Photo or Video based on type
            if (previewType === 'image') {
                const newPhoto: Photo = {
                    id: mediaId,
                    url: uploadedUrl,
                    timestamp,
                    description: description.trim() || `Captured in ${selectedRoom || 'field'}`,
                    category: selectedRoom || 'General',
                    tags: ['Mobile Capture', selectedRoom].filter(Boolean) as string[],
                    geolocation,
                };
                
                // Optional: Auto-analyze the photo using AI in the background
                EventBus.publish('com.restorationai.log.entry', { message: 'New photo captured from mobile', category: 'Documentation' }, project.id, 'Photo Captured', 'success');
                
                onUpdateProject({
                    photos: [newPhoto, ...(project.photos || [])]
                });
            } else {
                const newVideo: VideoLog = {
                    id: mediaId,
                    url: uploadedUrl,
                    timestamp,
                    description: description.trim() || `Recorded in ${selectedRoom || 'field'}`
                };
                
                EventBus.publish('com.restorationai.log.entry', { message: 'New video recorded from mobile', category: 'Documentation' }, project.id, 'Video Recorded', 'success');
                
                onUpdateProject({
                    videos: [newVideo, ...(project.videos || [])]
                });
            }

            handleCancel();
        } catch (error) {
            console.error("Failed to save media", error);
            alert("Failed to save media. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6 rounded-2xl border border-white/10 relative overflow-hidden">
            {/* Hidden native input for mobile capture */}
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelected} 
                accept="image/*,video/*" 
                capture="environment" 
                className="hidden" 
            />

            {!previewUrl ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                    <div className="text-center space-y-2">
                        <div className="flex justify-between items-center w-full px-6 absolute top-4 left-0">
                        <div className="w-8"></div>
                        <h2 className="text-xl font-bold text-white">Mobile Media Capture</h2>
                        <button onClick={onClose} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20">
                            <X size={20} />
                        </button>
                    </div>
                        <p className="text-sm text-slate-400 max-w-xs mx-auto">
                            Instantly capture and auto-tag photos and short videos for {project.name}.
                        </p>
                    </div>

                    <button 
                        onClick={handleCaptureClick}
                        className="relative group w-48 h-48 rounded-full bg-gradient-to-br from-brand-cyan/20 to-blue-600/20 flex flex-col items-center justify-center border border-white/10 shadow-2xl hover:scale-105 active:scale-95 transition-all"
                    >
                        <div className="absolute inset-0 rounded-full bg-brand-cyan/10 animate-ping opacity-20" />
                        <Camera size={48} className="text-brand-cyan mb-2 group-hover:scale-110 transition-transform" />
                        <Video size={32} className="text-blue-400 absolute bottom-12 right-12 opacity-50" />
                        <span className="font-bold text-white tracking-widest uppercase text-sm mt-2">Capture</span>
                    </button>
                    
                    <div className="flex items-center space-x-2 text-xs text-slate-500 bg-white/5 px-4 py-2 rounded-full">
                        <MapPin size={12} />
                        <span>Auto-tags location & time</span>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col h-full overflow-y-auto pb-20">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white font-bold tracking-wider uppercase text-sm">Review & Tag</h3>
                        <button onClick={handleCancel} className="p-2 bg-white/10 text-white rounded-full hover:bg-white/20">
                            <X size={18} />
                        </button>
                    </div>
                    
                    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden mb-6 relative border border-white/10 shadow-xl">
                        {previewType === 'image' ? (
                            <img src={previewUrl} className="w-full h-full object-cover" alt="Preview" />
                        ) : (
                            <video src={previewUrl} className="w-full h-full object-cover" controls playsInline />
                        )}
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] text-white font-mono flex items-center space-x-1">
                            <Clock size={10} className="text-brand-cyan" />
                            <span>{new Date().toLocaleTimeString()}</span>
                        </div>
                    </div>

                    <div className="space-y-5 flex-1">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block flex items-center"><MapPin size={12} className="mr-1"/> Location / Room</label>
                            <select 
                                value={selectedRoom}
                                onChange={e => setSelectedRoom(e.target.value)}
                                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-cyan outline-none"
                            >
                                <option value="">General Project Area</option>
                                {project.rooms?.map(r => (
                                    <option key={r.name} value={r.name}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block flex items-center"><FileText size={12} className="mr-1"/> Description (Optional)</label>
                            <textarea 
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Describe the damage, mitigation steps, or observations..."
                                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-cyan outline-none min-h-[100px]"
                            />
                        </div>
                    </div>

                    <div className="pt-6">
                        <button 
                            onClick={handleSave}
                            disabled={isProcessing}
                            className="w-full py-4 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl font-bold flex items-center justify-center space-x-2 transition-all disabled:opacity-50 shadow-lg shadow-brand-cyan/20"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    <span>Saving to Project...</span>
                                </>
                            ) : (
                                <>
                                    <Check size={20} />
                                    <span>Save & Upload</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
