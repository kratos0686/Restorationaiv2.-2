import React, { useState, useRef, useEffect } from 'react';
import { Camera, StopCircle, Play, Video as VideoIcon, Trash2, Save } from 'lucide-react';
import { VideoLog, Project } from '../types';
import { EventBus } from '../services/EventBus';

interface VideoLoggerProps {
    project: Project;
    onUpdate?: (updates: Partial<Project>) => void;
}

export default function VideoLogger({ project, onUpdate }: VideoLoggerProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [isStreamActive, setIsStreamActive] = useState(false);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [description, setDescription] = useState('');
    const [selectedRoom, setSelectedRoom] = useState<string>('');
    const [selectedTask, setSelectedTask] = useState<string>('');
    
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const liveVideoRef = useRef<HTMLVideoElement>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            setIsStreamActive(true);
            
            if (liveVideoRef.current) {
                liveVideoRef.current.srcObject = stream;
                liveVideoRef.current.play();
            }

            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            mediaRecorderRef.current = mediaRecorder;
            setRecordedChunks([]);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    setRecordedChunks(prev => [...prev, e.data]);
                }
            };

            mediaRecorder.onstop = () => {
                // Blob creation handled in stopRecording
            };

            mediaRecorder.start(200); // collect data every 200ms
            setIsRecording(true);
        } catch (err) {
            console.error("Camera access denied:", err);
            alert("Could not access camera/microphone. Please allow permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            
            // Stop tracks
            streamRef.current?.getTracks().forEach(t => t.stop());
            setIsStreamActive(false);

            if (liveVideoRef.current) {
                liveVideoRef.current.srcObject = null;
            }

            // Create preview
            setTimeout(() => {
                setRecordedChunks(currentChunks => {
                    const blob = new Blob(currentChunks, { type: 'video/webm' });
                    setPreviewUrl(URL.createObjectURL(blob));
                    return currentChunks;
                });
            }, 300);
        }
    };

    const clearPreview = () => {
        setPreviewUrl(null);
        setRecordedChunks([]);
        setDescription('');
        setSelectedRoom('');
        setSelectedTask('');
    };

    const saveVideo = () => {
        if (!onUpdate) return;
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        // In a real app we upload the blob. We simulate with an object URL.
        const url = URL.createObjectURL(blob);
        
        const newLog: VideoLog = {
            id: `vid-${Date.now()}`,
            url,
            timestamp: Date.now(),
            description: `${selectedRoom ? `[${selectedRoom}] ` : ''}${selectedTask ? `Task: ${selectedTask} | ` : ''}${description}`.trim()
        };

        const updatedVideos = [newLog, ...(project.videos || [])];
        onUpdate({ videos: updatedVideos });
        EventBus.publish('com.restorationai.log.entry', { message: 'New video log added', category: 'Documentation' }, project.id, 'Video Added', 'info');

        clearPreview();
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 border border-white/5 rounded-2xl overflow-hidden p-6 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center"><VideoIcon size={20} className="mr-2 text-brand-cyan"/> Video Logger</h2>
            
            {!previewUrl && (
                <div className="flex flex-col items-center space-y-4">
                    <div className="relative w-full max-w-lg aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center">
                        <video ref={liveVideoRef} className="w-full h-full object-cover" muted />
                        {!isRecording && !isStreamActive && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                                <Camera size={48} className="mb-2 opacity-50"/>
                                <p className="text-sm font-bold uppercase tracking-widest">Ready to Record</p>
                            </div>
                        )}
                        {isRecording && (
                            <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-500/20 px-3 py-1 rounded-full border border-red-500/50">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                <span className="text-xs font-black text-red-500 tracking-wider">REC</span>
                            </div>
                        )}
                    </div>
                    
                    {isRecording ? (
                        <button onClick={stopRecording} className="flex items-center space-x-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold transition-all shadow-lg shadow-red-900/50">
                            <StopCircle size={20} />
                            <span>Stop Recording</span>
                        </button>
                    ) : (
                        <button onClick={startRecording} className="flex items-center space-x-2 px-6 py-3 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-full font-bold transition-all shadow-lg shadow-brand-cyan/20">
                            <VideoIcon size={20} />
                            <span>Start Recording</span>
                        </button>
                    )}
                </div>
            )}

            {previewUrl && (
                <div className="flex flex-col space-y-6 w-full max-w-lg mx-auto">
                    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                        <video src={previewUrl} controls className="w-full h-full object-cover" />
                    </div>
                    
                    <div className="space-y-4 bg-slate-950 p-6 rounded-2xl border border-white/5">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Room / Area</label>
                            <select 
                                value={selectedRoom} 
                                onChange={(e) => setSelectedRoom(e.target.value)}
                                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-brand-cyan"
                            >
                                <option value="">General Project Area</option>
                                {project.rooms.map(r => (
                                    <option key={r.name} value={r.name}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Related Task</label>
                            <select 
                                value={selectedTask} 
                                onChange={(e) => setSelectedTask(e.target.value)}
                                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-brand-cyan"
                            >
                                <option value="">None</option>
                                {project.tasks?.map(t => (
                                    <option key={t.id} value={t.id}>{t.text || t.id}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Description</label>
                            <textarea 
                                value={description} 
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe the video..."
                                className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-brand-cyan min-h-[80px]"
                            />
                        </div>

                        <div className="flex space-x-3 pt-2">
                            <button onClick={clearPreview} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center justify-center space-x-2 transition-colors">
                                <Trash2 size={16} /> <span>Discard</span>
                            </button>
                            <button onClick={saveVideo} className="flex-1 py-3 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-xl font-bold flex items-center justify-center space-x-2 transition-colors">
                                <Save size={16} /> <span>Save Video Log</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Videos List */}
            {(!previewUrl && project.videos && project.videos.length > 0) && (
                <div className="pt-8 border-t border-white/5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest">Project Video Logs</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {project.videos.map(v => (
                            <div key={v.id} className="bg-slate-950 border border-white/5 rounded-xl p-4 flex flex-col space-y-3 relative group">
                                <button className="absolute top-4 right-4 p-2 bg-red-500/20 text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white" onClick={() => {
                                    if(onUpdate) {
                                        onUpdate({ videos: project.videos!.filter(vid => vid.id !== v.id) });
                                    }
                                }}>
                                    <Trash2 size={14} />
                                </button>
                                <div className="aspect-video bg-black rounded-lg overflow-hidden relative group">
                                    <video src={v.url} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => {
                                            const video = e.currentTarget.parentElement?.previousElementSibling as HTMLVideoElement;
                                            if (video) {
                                                video.controls = true;
                                                video.play();
                                            }
                                        }} className="p-3 bg-brand-cyan rounded-full text-slate-900 shadow-lg"><Play size={20} className="ml-1" /></button>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 mb-1">{new Date(v.timestamp).toLocaleString()}</p>
                                    <p className="text-sm font-bold text-white line-clamp-2">{v.description || 'No description provided'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
