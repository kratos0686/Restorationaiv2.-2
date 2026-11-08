import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  StopCircle,
  Video as VideoIcon,
  Trash2,
  Save,
  Upload,
  Plus,
  Clock,
  Scissors,
  AlertCircle
} from 'lucide-react';
import {
  VideoLog,
  Project,
  MediaPhaseCategory,
  VideoTimestampAnnotation,
  Photo
} from '../types';
import { EventBus } from '../services/EventBus';

interface VideoLoggerProps {
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
  onExtractFrameToPhoto?: (photo: Photo) => void;
}

const PHASE_OPTIONS: { value: MediaPhaseCategory; label: string }[] = [
  { value: 'before', label: 'Before (Initial Loss)' },
  { value: 'during', label: 'During (Active Mitigation)' },
  { value: 'after', label: 'After (Post-Drying Verification)' },
  { value: 'specific_damage', label: 'Specific Damage Type' }
];

const DAMAGE_TYPES = [
  'Source of Loss / Plumbing',
  'Standing Water / Extraction',
  'Drywall & Flood Cut (2ft / 4ft)',
  'Subfloor & Flooring Delamination',
  'Ceiling / Overhead Saturation',
  'Microbial / Suspected Growth',
  'Containment & Negative Air',
  'Moisture Meter / Thermal Verification',
  'Equipment Placement'
];

export default function VideoLogger({
  project,
  onUpdate,
  onExtractFrameToPhoto
}: VideoLoggerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [_recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');
  const [phaseCategory, setPhaseCategory] = useState<MediaPhaseCategory>('before');
  const [damageType, setDamageType] = useState(DAMAGE_TYPES[0]);
  const [selectedRoom, setSelectedRoom] = useState<string>(project.rooms?.[0]?.name || '');
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(['Walkthrough', 'Field Video']);

  // Active video inspection & timestamped annotation state
  const [activeVideoId, setActiveVideoId] = useState<string | null>(
    project.videos?.[0]?.id || null
  );
  const [frameNoteText, setFrameNoteText] = useState('');
  const [frameNoteDamage, setFrameNoteDamage] = useState(DAMAGE_TYPES[0]);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const inspectVideoRef = useRef<HTMLVideoElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const formatTimeSec = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setCameraError(null);
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

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
          setRecordedChunks(prev => [...prev, e.data]);
        }
      };

      mediaRecorder.start(200);
      setIsRecording(true);
    } catch (err) {
      console.error('Camera access denied:', err);
      setCameraError(
        'Camera or microphone permission unavailable in this environment. Use "Upload Video File" to attach field video walkthroughs.'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      streamRef.current?.getTracks().forEach(t => t.stop());
      setIsStreamActive(false);

      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }

      setTimeout(() => {
        setRecordedChunks(currentChunks => {
          const blob = new Blob(currentChunks, { type: 'video/webm' });
          setPreviewUrl(URL.createObjectURL(blob));
          return currentChunks;
        });
      }, 300);
    }
  };

  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    if (!caption) {
      setCaption(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    setRecordedChunks([]);
    setCaption('');
    setDescription('');
    setSelectedTask('');
  };

  const handleAddTag = () => {
    const clean = tagInput.trim();
    if (!clean || tags.includes(clean)) return;
    setTags([...tags, clean]);
    setTagInput('');
  };

  const saveVideo = () => {
    if (!onUpdate || !previewUrl) return;

    const phaseLabel =
      PHASE_OPTIONS.find(p => p.value === phaseCategory)?.label || 'Before (Initial Loss)';
    const combinedTags = Array.from(
      new Set([
        ...tags,
        phaseCategory === 'before'
          ? 'Before'
          : phaseCategory === 'during'
          ? 'During'
          : phaseCategory === 'after'
          ? 'After'
          : 'Specific Damage',
        damageType,
        ...(selectedRoom ? [selectedRoom] : [])
      ])
    );

    const newLog: VideoLog = {
      id: `vid-${Date.now()}`,
      url: previewUrl,
      timestamp: Date.now(),
      caption: caption.trim() || `${phaseLabel} — ${selectedRoom || 'Site'} Walkthrough`,
      description:
        description.trim() ||
        `${phaseLabel} walkthrough in ${selectedRoom || 'general loss area'} (${damageType}).`,
      phaseCategory,
      damageType,
      roomName: selectedRoom || 'General Area',
      tags: combinedTags,
      videoAnnotations: [],
      linkedTaskId: selectedTask || undefined
    };

    const updatedVideos = [newLog, ...(project.videos || [])];
    onUpdate({ videos: updatedVideos });
    setActiveVideoId(newLog.id);

    EventBus.publish(
      'com.restorationai.log.entry',
      { message: `Video log saved: ${newLog.caption}`, category: 'Documentation' },
      project.id,
      'Video Log Saved',
      'success'
    );

    clearPreview();
  };

  const activeVideo = (project.videos || []).find(v => v.id === activeVideoId) || null;

  const handleAddTimestampAnnotation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVideo || !frameNoteText.trim() || !onUpdate) return;

    const currentSec = inspectVideoRef.current
      ? Math.round(inspectVideoRef.current.currentTime)
      : 0;

    const newAnnotation: VideoTimestampAnnotation = {
      id: `vann-${Date.now()}`,
      timestampSec: currentSec,
      label: frameNoteText.trim(),
      damageType: frameNoteDamage
    };

    const updatedVideos = (project.videos || []).map(v => {
      if (v.id === activeVideo.id) {
        return {
          ...v,
          videoAnnotations: [...(v.videoAnnotations || []), newAnnotation].sort(
            (a, b) => a.timestampSec - b.timestampSec
          )
        };
      }
      return v;
    });

    onUpdate({ videos: updatedVideos });
    setFrameNoteText('');
    EventBus.publish(
      'com.restorationai.log.entry',
      {
        message: `Video callout added at ${formatTimeSec(currentSec)}: ${newAnnotation.label}`,
        category: 'Documentation'
      },
      project.id,
      'Video Frame Callout Added',
      'info'
    );
  };

  const handleDeleteTimestampAnnotation = (annId: string) => {
    if (!activeVideo || !onUpdate) return;
    const updatedVideos = (project.videos || []).map(v => {
      if (v.id === activeVideo.id) {
        return {
          ...v,
          videoAnnotations: (v.videoAnnotations || []).filter(a => a.id !== annId)
        };
      }
      return v;
    });
    onUpdate({ videos: updatedVideos });
  };

  const handleSeekToAnnotation = (sec: number) => {
    if (inspectVideoRef.current) {
      inspectVideoRef.current.currentTime = sec;
      inspectVideoRef.current.play().catch(() => {});
    }
  };

  const handleExtractFrame = () => {
    if (!activeVideo || !onExtractFrameToPhoto) return;
    const videoEl = inspectVideoRef.current;
    const currentSec = videoEl ? Math.round(videoEl.currentTime) : 0;

    let dataUrl = '';
    if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      }
    }

    if (!dataUrl) {
      // Fallback high-contrast frame snapshot SVG if video element has no decoded frame
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
        <rect width="800" height="600" fill="#0f172a"/>
        <rect x="32" y="32" width="736" height="536" rx="12" fill="#1e293b" stroke="#06b6d4" stroke-width="2"/>
        <text x="64" y="100" fill="#f8fafc" font-family="sans-serif" font-size="24" font-weight="bold">EXTRACTED VIDEO KEYFRAME (${formatTimeSec(currentSec)})</text>
        <text x="64" y="145" fill="#94a3b8" font-family="monospace" font-size="16">Source: ${activeVideo.caption || 'Field Video Walkthrough'}</text>
        <text x="64" y="185" fill="#38bdf8" font-family="sans-serif" font-size="18">Damage Type: ${activeVideo.damageType || 'Water Mitigation'}</text>
      </svg>`;
      dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    const extractedPhoto: Photo = {
      id: `frame-${Date.now()}`,
      url: dataUrl,
      originalUrl: dataUrl,
      timestamp: Date.now(),
      caption: `${activeVideo.caption || 'Video'} — Frame @ ${formatTimeSec(currentSec)}`,
      phaseCategory: activeVideo.phaseCategory || 'during',
      damageType: activeVideo.damageType || DAMAGE_TYPES[0],
      roomName: activeVideo.roomName || selectedRoom || 'Living Room',
      tags: Array.from(new Set([...(activeVideo.tags || []), 'Extracted Keyframe'])),
      notes: `Extracted still frame at ${formatTimeSec(currentSec)} from video log: ${
        activeVideo.description || ''
      }`,
      type: 'image'
    };

    onExtractFrameToPhoto(extractedPhoto);
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Capture / Upload Video Card */}
      <div className="bg-slate-900 border border-white/10 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <VideoIcon size={18} className="text-brand-cyan" />
              <span>Field Video Walkthrough & Frame Annotation Logger</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Record or upload room walkthrough videos, categorize by phase and damage type, and annotate specific timestamps.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileUploadRef}
              type="file"
              accept="video/*"
              onChange={handleVideoFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileUploadRef.current?.click()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload size={14} className="text-brand-cyan" />
              <span>Upload Video File</span>
            </button>

            {isRecording ? (
              <button
                type="button"
                onClick={stopRecording}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <StopCircle size={15} />
                <span>Stop Recording</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Camera size={15} />
                <span>Record Camera</span>
              </button>
            )}
          </div>
        </div>

        {cameraError && (
          <div className="p-3.5 bg-amber-950/50 border border-amber-500/30 rounded-lg text-xs text-amber-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-400 shrink-0" />
              <span>{cameraError}</span>
            </div>
            <button
              type="button"
              onClick={() => fileUploadRef.current?.click()}
              className="px-3 py-1 bg-amber-400 text-slate-950 font-bold rounded-md whitespace-nowrap shrink-0"
            >
              Choose Video File
            </button>
          </div>
        )}

        {/* Active Recording Stream View */}
        {!previewUrl && isStreamActive && (
          <div className="relative w-full max-w-2xl mx-auto aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
            <video ref={liveVideoRef} className="w-full h-full object-cover" muted />
            {isRecording && (
              <div className="absolute top-3 right-3 px-2.5 py-1 bg-rose-600 text-white text-xs font-mono font-bold rounded">
                RECORDING LIVE
              </div>
            )}
          </div>
        )}

        {/* Preview & Metadata Categorization Form */}
        {previewUrl && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            <div className="lg:col-span-6">
              <div className="w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                <video src={previewUrl} controls className="w-full h-full object-contain" />
              </div>
            </div>

            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Descriptive Video Caption *
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder="e.g. Initial Kitchen Supply Line Burst & Standing Water"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Mitigation Phase Category
                  </label>
                  <select
                    value={phaseCategory}
                    onChange={e => setPhaseCategory(e.target.value as MediaPhaseCategory)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {PHASE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Specific Damage Classification
                  </label>
                  <select
                    value={damageType}
                    onChange={e => setDamageType(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {DAMAGE_TYPES.map(dt => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Room / Drying Chamber
                  </label>
                  <select
                    value={selectedRoom}
                    onChange={e => setSelectedRoom(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="General Area">General Project Area</option>
                    {project.rooms?.map(r => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Add Custom Tag
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      placeholder="e.g. Category 3, Thermal..."
                      className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-3 py-2 bg-white/10 hover:bg-white/15 text-xs font-semibold text-white rounded-lg"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Detailed Technician Narrative / Notes
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Document water migration path, meter verification, or containment boundaries..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={clearPreview}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={saveVideo}
                  className="px-5 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  <Save size={14} />
                  <span>Save Categorized Video Log</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Existing Project Video Logs & Timestamped Annotation Workspace */}
      {project.videos && project.videos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Video Log Selector List */}
          <div className="lg:col-span-5 bg-slate-900 border border-white/10 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">
              Cataloged Project Videos ({project.videos.length})
            </h3>
            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {project.videos.map(v => {
                const isSelected = activeVideo?.id === v.id;
                const annCount = v.videoAnnotations?.length || 0;
                return (
                  <div
                    key={v.id}
                    onClick={() => setActiveVideoId(v.id)}
                    className={`p-3.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-slate-800 border-brand-cyan'
                        : 'bg-slate-950/60 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-white">
                          {v.caption || v.description || 'Field Walkthrough Video'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {(v.phaseCategory || 'before').toUpperCase()} ·{' '}
                          {v.roomName || 'General Area'} · {v.damageType || 'Water Loss'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          if (onUpdate) {
                            onUpdate({
                              videos: project.videos!.filter(vid => vid.id !== v.id)
                            });
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-rose-500/10"
                        title="Delete Video"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-2 flex items-center justify-between tabular-nums">
                      <span>{new Date(v.timestamp).toLocaleDateString()}</span>
                      <span>{annCount} timestamp callout(s)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Active Video Player & Timestamped Frame Annotations */}
          {activeVideo && (
            <div className="lg:col-span-7 bg-slate-900 border border-white/10 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {activeVideo.caption || 'Walkthrough Video Inspection'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {(activeVideo.phaseCategory || 'before').toUpperCase()} ·{' '}
                    {activeVideo.roomName || 'General Area'} ·{' '}
                    {activeVideo.damageType || 'Mitigation Evidence'}
                  </p>
                </div>

                {onExtractFrameToPhoto && (
                  <button
                    type="button"
                    onClick={handleExtractFrame}
                    className="px-3 py-1.5 bg-brand-cyan/15 hover:bg-brand-cyan/25 border border-brand-cyan/40 text-brand-cyan rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Scissors size={13} />
                    <span>Extract Frame & Annotate</span>
                  </button>
                )}
              </div>

              <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
                <video
                  ref={inspectVideoRef}
                  src={activeVideo.url}
                  controls
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Add Timestamped Callout Form */}
              <form
                onSubmit={handleAddTimestampAnnotation}
                className="flex flex-wrap items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  value={frameNoteText}
                  onChange={e => setFrameNoteText(e.target.value)}
                  placeholder="Pause video & add callout at current timestamp (e.g. Baseboard saturation 99% MC)..."
                  className="flex-1 min-w-[220px] bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                />
                <select
                  value={frameNoteDamage}
                  onChange={e => setFrameNoteDamage(e.target.value)}
                  className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-brand-cyan"
                >
                  {DAMAGE_TYPES.map(dt => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={!frameNoteText.trim()}
                  className="px-3.5 py-2 bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus size={14} />
                  <span>Log Timestamp Callout</span>
                </button>
              </form>

              {/* Timestamped Callout List */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="text-xs font-semibold text-slate-300">
                  Timestamped Video Annotations ({activeVideo.videoAnnotations?.length || 0})
                </div>
                {!activeVideo.videoAnnotations || activeVideo.videoAnnotations.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No timestamped callouts yet. Scrub the video above and log key damage observations.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {activeVideo.videoAnnotations.map(ann => (
                      <div
                        key={ann.id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-950/70 border border-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleSeekToAnnotation(ann.timestampSec)}
                            className="px-2 py-0.5 bg-brand-cyan/20 text-brand-cyan rounded font-mono font-bold flex items-center gap-1 hover:bg-brand-cyan hover:text-slate-950 transition-colors tabular-nums"
                          >
                            <Clock size={11} />
                            <span>{formatTimeSec(ann.timestampSec)}</span>
                          </button>
                          <span className="text-white font-medium">{ann.label}</span>
                          {ann.damageType && (
                            <span className="text-slate-400">· {ann.damageType}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTimestampAnnotation(ann.id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Remove Callout"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
