import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Loader2,
  Sparkles,
  BrainCircuit,
  Video,
  X,
  Upload,
  Play,
  Mic,
  MicOff,
  PenTool,
  Search,
  Layers,
  Grid,
  Columns,
  CheckSquare,
  Square,
  Trash2,
  Plus,
  RotateCcw,
  Clock,
  Scissors,
  SlidersHorizontal
} from 'lucide-react';
import { blobToBase64 } from '../utils/photoutils';
import { useAppContext } from '../context/AppContext';
import {
  Project,
  Photo,
  MediaPhaseCategory,
  VideoTimestampAnnotation,
  VideoLog
} from '../types';
import { AIRouterClient } from '../services/AIRouterClient';
import { EventBus } from '../services/EventBus';
import { uploadMedia } from '../services/api';
import VideoLogger from './VideoLogger';
import ImageAnnotator from './ImageAnnotator';
import WaterMitigationDocumentation from './WaterMitigationDocumentation';
import MobileMediaCapture from './MobileMediaCapture';

interface PhotoDocumentationProps {
  onStartScan: () => void;
  isMobile?: boolean;
  project: Project;
  onUpdate?: (updates: Partial<Project>) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const PHASE_CATEGORIES: {
  id: MediaPhaseCategory;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'before',
    label: '01. Before — Initial Loss & Pre-Mitigation',
    shortLabel: 'Before',
    description: 'Pre-mitigation standing water, source of loss, and baseline moisture readings'
  },
  {
    id: 'during',
    label: '02. During — Active Mitigation & Demolition',
    shortLabel: 'During',
    description: 'Flood cuts, containment barriers, active air movers, and LGR dehumidifiers'
  },
  {
    id: 'after',
    label: '03. After — Post-Drying Verification',
    shortLabel: 'After',
    description: 'Dry standard verification readings, clean framing, and equipment removal'
  },
  {
    id: 'specific_damage',
    label: '04. Specific Damage Type Classifications',
    shortLabel: 'Specific Damage',
    description: 'Targeted assemblies, microbial concerns, plumbing failures, and pre-existing conditions'
  }
];

// eslint-disable-next-line react-refresh/only-export-components
export const DAMAGE_TYPE_OPTIONS = [
  'Source of Loss / Plumbing',
  'Standing Water / Extraction',
  'Drywall & Flood Cut (2ft / 4ft)',
  'Subfloor & Flooring Delamination',
  'Ceiling / Overhead Saturation',
  'Microbial / Suspected Growth',
  'Containment & Negative Air',
  'Moisture Meter / Thermal Verification',
  'Equipment Placement',
  'Pre-Existing / Non-Related Condition'
];

const SUGGESTED_TAGS: Record<string, string[]> = {
  'Phase & Status': ['Before', 'During', 'After', 'Pre-Existing Damage', 'Dry Standard Verified'],
  'Mitigation Tasks': [
    'Water Extraction',
    'Containment Setup',
    '2ft Flood Cut',
    '4ft Flood Cut',
    'Antimicrobial Application',
    'Debris Removal'
  ],
  'Water Category': ['Category 1', 'Category 2', 'Category 3', 'Class 2', 'Class 3'],
  'Building Assemblies': [
    'Drywall',
    'Carpet & Pad',
    'OSB Subfloor',
    'Hardwood',
    'MDF Baseboard',
    'Wall Insulation',
    'Cabinetry'
  ],
  'Equipment & Meters': [
    'Air Mover',
    'LGR Dehumidifier',
    'HEPA Scrubber',
    'Pin Meter',
    'Pinless Meter',
    'Thermal Camera'
  ]
};

type TabType = 'gallery' | 'mitigation' | 'video';
type LayoutMode = 'grid' | 'timeline' | 'compare';
type PhotoItem = Photo & { type: 'image' | 'video' };

function inferPhaseFromPhoto(item: Partial<Photo>): MediaPhaseCategory {
  if (item.phaseCategory) return item.phaseCategory;
  const joined = `${item.caption || ''} ${item.notes || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
  if (joined.includes('after') || joined.includes('final') || joined.includes('dry standard')) {
    return 'after';
  }
  if (
    joined.includes('during') ||
    joined.includes('drying process') ||
    joined.includes('equipment') ||
    joined.includes('flood cut')
  ) {
    return 'during';
  }
  if (joined.includes('specific') || joined.includes('microbial') || joined.includes('plumbing')) {
    return 'specific_damage';
  }
  return 'before';
}

const PhotoDocumentation: React.FC<PhotoDocumentationProps> = ({ project, onUpdate }) => {
  const { isOnline, accessToken } = useAppContext();
  const [activeTab, setActiveTab] = useState<TabType>('gallery');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');

  // Filtering & Search state
  const [phaseFilter, setPhaseFilter] = useState<'all' | MediaPhaseCategory>('all');
  const [damageTypeFilter, setDamageTypeFilter] = useState<string>('all');
  const [roomFilter, setRoomFilter] = useState<string>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'video' | 'annotated'>('all');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Upload Staging Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<MediaPhaseCategory>('before');
  const [uploadDamageType, setUploadDamageType] = useState<string>(DAMAGE_TYPE_OPTIONS[0]);
  const [uploadRoomId, setUploadRoomId] = useState<string>(project.rooms?.[0]?.id || '');
  const [uploadCaptionPrefix, setUploadCaptionPrefix] = useState<string>('');
  const [uploadMeterReading, setUploadMeterReading] = useState<string>('');
  const [uploadTags, setUploadTags] = useState<string[]>(['Before', 'Field Inspection']);
  const [uploadCustomTag, setUploadCustomTag] = useState<string>('');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Batch Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPhase, setBatchPhase] = useState<MediaPhaseCategory>('during');
  const [batchDamageType, setBatchDamageType] = useState<string>(DAMAGE_TYPE_OPTIONS[2]);
  const [batchTagInput, setBatchTagInput] = useState<string>('');

  // Inspector & Annotation state
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState<Set<string>>(new Set());
  const [customTag, setCustomTag] = useState('');
  const [isRecordingDictation, setIsRecordingDictation] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // Video Timestamp Annotation inside Detail Modal
  const detailVideoRef = useRef<HTMLVideoElement>(null);
  const [videoCalloutText, setVideoCalloutText] = useState('');

  // Compare Before / After state
  const [compareBeforeId, setCompareBeforeId] = useState<string>('');
  const [compareAfterId, setCompareAfterId] = useState<string>('');

  const updateNotesRef = useRef<((id: string, notes: string) => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  interface SpeechRecognitionEvent {
    resultIndex: number;
    results: {
      length: number;
      [index: number]: {
        isFinal: boolean;
        [index: number]: { transcript: string };
      };
    };
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }

  interface SpeechRecognitionInstance {
    continuous: boolean;
    interimResults: boolean;
    start: () => void;
    stop: () => void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
  }

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Synchronize unified media list from project rooms + project videos
  useEffect(() => {
    const _window = window as typeof window & {
      webkitSpeechRecognition?: unknown;
      SpeechRecognition?: unknown;
    };
    const SpeechRecognitionImpl = _window.SpeechRecognition || _window.webkitSpeechRecognition;
    if (typeof SpeechRecognitionImpl === 'function') {
      // @ts-expect-error - browser speech recognition constructor
      recognitionRef.current = new SpeechRecognitionImpl();
      if (recognitionRef.current) {
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            }
          }
          if (finalTranscript && selectedPhoto && updateNotesRef.current) {
            updateNotesRef.current(
              selectedPhoto.id,
              selectedPhoto.notes
                ? `${selectedPhoto.notes}\n${finalTranscript}`
                : finalTranscript
            );
          }
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error', event.error);
          setIsRecordingDictation(false);
        };

        recognitionRef.current.onend = () => {
          setIsRecordingDictation(false);
        };
      }
    }

    const projectPhotos: PhotoItem[] = [
      ...(project.rooms || []).flatMap(room =>
        (room.photos || []).map(p => ({
          ...p,
          phaseCategory: inferPhaseFromPhoto(p),
          roomName: p.roomName || room.name,
          linkedRoomId: p.linkedRoomId || room.id,
          type: (p.type || 'image') as 'image' | 'video'
        }))
      ),
      ...(project.videos || []).map(
        v =>
          ({
            id: v.id,
            url: v.url,
            thumbnailUrl: v.thumbnail,
            timestamp: v.timestamp,
            caption: v.caption || v.description || 'Field Walkthrough Video',
            notes: v.description || '',
            phaseCategory: v.phaseCategory || 'before',
            damageType: v.damageType || 'Source of Loss / Plumbing',
            roomName: v.roomName || 'General Area',
            tags: v.tags || ['Video Log'],
            videoAnnotations: v.videoAnnotations || [],
            linkedRoomId: v.linkedRoomId,
            linkedTaskId: v.linkedTaskId,
            linkedEquipmentId: v.linkedEquipmentId,
            type: 'video' as const
          } as PhotoItem)
      )
    ];

    setPhotos(projectPhotos);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [project, selectedPhoto]);

  // Persist helper for any field update on a photo or video
  const persistMediaPatch = useCallback(
    (mediaId: string, patch: Partial<PhotoItem>) => {
      if (!onUpdate) return;

      let matchedInVideos = false;
      const updatedVideos: VideoLog[] = (project.videos || []).map(v => {
        if (v.id === mediaId) {
          matchedInVideos = true;
          return {
            ...v,
            caption: patch.caption !== undefined ? patch.caption : v.caption,
            description: patch.notes !== undefined ? patch.notes : v.description,
            phaseCategory:
              patch.phaseCategory !== undefined ? patch.phaseCategory : v.phaseCategory,
            damageType: patch.damageType !== undefined ? patch.damageType : v.damageType,
            roomName: patch.roomName !== undefined ? patch.roomName : v.roomName,
            tags: patch.tags !== undefined ? patch.tags : v.tags,
            videoAnnotations:
              patch.videoAnnotations !== undefined ? patch.videoAnnotations : v.videoAnnotations,
            linkedRoomId:
              patch.linkedRoomId !== undefined ? patch.linkedRoomId : v.linkedRoomId,
            linkedTaskId:
              patch.linkedTaskId !== undefined ? patch.linkedTaskId : v.linkedTaskId,
            linkedEquipmentId:
              patch.linkedEquipmentId !== undefined ? patch.linkedEquipmentId : v.linkedEquipmentId
          };
        }
        return v;
      });

      const updatedRooms = (project.rooms || []).map(room => ({
        ...room,
        photos: (room.photos || []).map(p => {
          if (p.id === mediaId) {
            return {
              ...p,
              ...patch
            };
          }
          return p;
        })
      }));

      if (matchedInVideos) {
        onUpdate({ videos: updatedVideos });
      } else {
        onUpdate({ rooms: updatedRooms });
      }
    },
    [onUpdate, project.rooms, project.videos]
  );

  const updateMediaItem = useCallback(
    (mediaId: string, patch: Partial<PhotoItem>) => {
      setPhotos(prev =>
        prev.map(item => {
          if (item.id === mediaId) {
            const next = { ...item, ...patch };
            if (selectedPhoto?.id === mediaId) {
              setSelectedPhoto(next);
            }
            return next;
          }
          return item;
        })
      );
      persistMediaPatch(mediaId, patch);
    },
    [selectedPhoto, persistMediaPatch]
  );

  const updateNotes = useCallback(
    (photoId: string, notes: string) => {
      updateMediaItem(photoId, { notes });
    },
    [updateMediaItem]
  );

  useEffect(() => {
    updateNotesRef.current = updateNotes;
  }, [updateNotes]);

  const handleSaveAnnotation = async (dataUrl: string) => {
    if (!selectedPhoto) return;
    const originalUrl = selectedPhoto.originalUrl || selectedPhoto.url;
    updateMediaItem(selectedPhoto.id, {
      url: dataUrl,
      originalUrl,
      isAnnotated: true,
      tags: Array.from(new Set([...selectedPhoto.tags, 'Annotated']))
    });
    setIsAnnotating(false);
    EventBus.publish(
      'com.restorationai.log.entry',
      { message: `Annotated media: ${selectedPhoto.caption || selectedPhoto.id}`, category: 'Documentation' },
      project.id,
      'Photo Annotation Saved',
      'success'
    );
  };

  const handleRevertAnnotation = () => {
    if (!selectedPhoto || !selectedPhoto.originalUrl) return;
    updateMediaItem(selectedPhoto.id, {
      url: selectedPhoto.originalUrl,
      isAnnotated: false,
      tags: selectedPhoto.tags.filter(t => t !== 'Annotated')
    });
    EventBus.publish(
      'com.restorationai.log.entry',
      { message: 'Reverted photo to un-annotated original', category: 'Documentation' },
      project.id,
      'Reverted to Original',
      'info'
    );
  };

  const handleDeleteMedia = (mediaId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPhotos(prev => prev.filter(p => p.id !== mediaId));
    if (selectedPhoto?.id === mediaId) {
      setSelectedPhoto(null);
    }
    if (!onUpdate) return;
    const updatedRooms = (project.rooms || []).map(room => ({
      ...room,
      photos: (room.photos || []).filter(p => p.id !== mediaId)
    }));
    const updatedVideos = (project.videos || []).filter(v => v.id !== mediaId);
    onUpdate({ rooms: updatedRooms, videos: updatedVideos });
    EventBus.publish(
      'com.restorationai.log.entry',
      { message: 'Removed media item from project', category: 'Documentation' },
      project.id,
      'Media Removed',
      'info'
    );
  };

  const toggleTag = (photoId: string, tag: string) => {
    const target = photos.find(p => p.id === photoId);
    if (!target) return;
    const hasTag = target.tags.includes(tag);
    const newTags = hasTag ? target.tags.filter(t => t !== tag) : [...target.tags, tag];
    updateMediaItem(photoId, { tags: newTags });
  };

  const addCustomTag = (photoId: string) => {
    if (!customTag.trim()) return;
    const clean = customTag.trim();
    const target = photos.find(p => p.id === photoId);
    if (target && !target.tags.includes(clean)) {
      updateMediaItem(photoId, { tags: [...target.tags, clean] });
    }
    setCustomTag('');
  };

  const toggleDictation = () => {
    if (!recognitionRef.current) {
      EventBus.publish(
        'com.restorationai.notification',
        { title: 'Dictation Unavailable', message: 'Speech recognition is not supported in this browser.' },
        project.id,
        'Speech Recognition Unavailable',
        'warning'
      );
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

  // Video timestamp callout handler in detail modal
  const handleAddVideoCalloutInModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhoto || selectedPhoto.type !== 'video' || !videoCalloutText.trim()) return;
    const sec = detailVideoRef.current ? Math.round(detailVideoRef.current.currentTime) : 0;
    const newCallout: VideoTimestampAnnotation = {
      id: `vc-${Date.now()}`,
      timestampSec: sec,
      label: videoCalloutText.trim(),
      damageType: selectedPhoto.damageType
    };
    const nextAnnotations = [...(selectedPhoto.videoAnnotations || []), newCallout].sort(
      (a, b) => a.timestampSec - b.timestampSec
    );
    updateMediaItem(selectedPhoto.id, { videoAnnotations: nextAnnotations });
    setVideoCalloutText('');
  };

  const handleExtractFrameFromModalVideo = () => {
    if (!selectedPhoto || selectedPhoto.type !== 'video') return;
    const videoEl = detailVideoRef.current;
    const sec = videoEl ? Math.round(videoEl.currentTime) : 0;
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
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
        <rect width="800" height="600" fill="#0f172a"/>
        <rect x="32" y="32" width="736" height="536" rx="12" fill="#1e293b" stroke="#06b6d4" stroke-width="2"/>
        <text x="64" y="110" fill="#f8fafc" font-family="sans-serif" font-size="24" font-weight="bold">EXTRACTED VIDEO FRAME (${sec}s)</text>
        <text x="64" y="160" fill="#38bdf8" font-family="sans-serif" font-size="18">${selectedPhoto.caption || 'Walkthrough Video'}</text>
      </svg>`;
      dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    const newFramePhoto: PhotoItem = {
      id: `frame-${Date.now()}`,
      url: dataUrl,
      originalUrl: dataUrl,
      timestamp: Date.now(),
      caption: `${selectedPhoto.caption || 'Video'} — Still Frame @ ${sec}s`,
      phaseCategory: selectedPhoto.phaseCategory || 'during',
      damageType: selectedPhoto.damageType || DAMAGE_TYPE_OPTIONS[0],
      roomName: selectedPhoto.roomName || 'Living Room',
      linkedRoomId: selectedPhoto.linkedRoomId,
      tags: Array.from(new Set([...selectedPhoto.tags, 'Video Frame Capture'])),
      notes: `Captured from video at ${sec}s. ${selectedPhoto.notes || ''}`,
      type: 'image'
    };

    if (onUpdate) {
      const updatedRooms = [...(project.rooms || [])];
      if (updatedRooms.length > 0) {
        updatedRooms[0] = {
          ...updatedRooms[0],
          photos: [newFramePhoto, ...(updatedRooms[0].photos || [])]
        };
        onUpdate({ rooms: updatedRooms });
      }
    }
    setPhotos(prev => [newFramePhoto, ...prev]);
    setSelectedPhoto(newFramePhoto);
    setIsAnnotating(true);
  };

  // Multi-Dimensional Filtering
  const filteredPhotos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return photos.filter(p => {
      if (phaseFilter !== 'all' && p.phaseCategory !== phaseFilter) return false;
      if (damageTypeFilter !== 'all' && p.damageType !== damageTypeFilter) return false;
      if (
        roomFilter !== 'all' &&
        p.linkedRoomId !== roomFilter &&
        p.roomName !== roomFilter
      ) {
        return false;
      }
      if (mediaTypeFilter === 'image' && p.type !== 'image') return false;
      if (mediaTypeFilter === 'video' && p.type !== 'video') return false;
      if (mediaTypeFilter === 'annotated' && !p.isAnnotated && !(p.videoAnnotations && p.videoAnnotations.length > 0)) {
        return false;
      }
      if (tagFilter !== 'All' && !p.tags.includes(tagFilter)) return false;

      if (q) {
        const haystack = [
          p.caption || '',
          p.notes || '',
          p.damageType || '',
          p.roomName || '',
          p.meterReading || '',
          ...(p.tags || [])
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [photos, phaseFilter, damageTypeFilter, roomFilter, mediaTypeFilter, tagFilter, searchQuery]);

  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: photos.length,
      before: 0,
      during: 0,
      after: 0,
      specific_damage: 0
    };
    photos.forEach(p => {
      const cat = p.phaseCategory || 'before';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [photos]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    photos.forEach(p => p.tags.forEach(t => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [photos]);

  // Batch Selection Actions
  const toggleSelectItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApplyBatchCategorization = () => {
    if (selectedIds.size === 0 || !onUpdate) return;

    const cleanBatchTag = batchTagInput.trim();
    const phaseTagLabel =
      PHASE_CATEGORIES.find(c => c.id === batchPhase)?.shortLabel || 'During';

    const updatedRooms = (project.rooms || []).map(room => ({
      ...room,
      photos: (room.photos || []).map(p => {
        if (!selectedIds.has(p.id)) return p;
        const nextTags = Array.from(
          new Set([
            ...p.tags,
            phaseTagLabel,
            batchDamageType,
            ...(cleanBatchTag ? [cleanBatchTag] : [])
          ])
        );
        return {
          ...p,
          phaseCategory: batchPhase,
          damageType: batchDamageType,
          tags: nextTags
        };
      })
    }));

    const updatedVideos = (project.videos || []).map(v => {
      if (!selectedIds.has(v.id)) return v;
      const nextTags = Array.from(
        new Set([
          ...(v.tags || []),
          phaseTagLabel,
          batchDamageType,
          ...(cleanBatchTag ? [cleanBatchTag] : [])
        ])
      );
      return {
        ...v,
        phaseCategory: batchPhase,
        damageType: batchDamageType,
        tags: nextTags
      };
    });

    onUpdate({ rooms: updatedRooms, videos: updatedVideos });
    setBatchTagInput('');
    setSelectedIds(new Set());
    EventBus.publish(
      'com.restorationai.log.entry',
      {
        message: `Updated categorization for ${selectedIds.size} media files`,
        category: 'Documentation'
      },
      project.id,
      'Batch Categorization Saved',
      'success'
    );
  };

  // Upload & Categorization Staging Handlers
  const generateVideoThumbnail = (file: File): Promise<string> => {
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        video.currentTime = 0.5;
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (canvas.width > 0 && canvas.height > 0 && ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg'));
        } else {
          resolve('');
        }
      };
      video.onerror = () => resolve('');
      video.src = URL.createObjectURL(file);
    });
  };

  const handleStageFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setStagedFiles(prev => [...prev, ...list]);
    if (!isUploadModalOpen) {
      setIsUploadModalOpen(true);
    }
  };

  const handleCommitStagedUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stagedFiles.length === 0) return;

    setIsProcessing(true);
    const newPhotos: PhotoItem[] = [];
    const newVideos: VideoLog[] = [];

    const targetRoom =
      project.rooms?.find(r => r.id === uploadRoomId) || project.rooms?.[0];
    const roomName = targetRoom?.name || 'Living Room';
    const phaseMeta = PHASE_CATEGORIES.find(c => c.id === uploadPhase) || PHASE_CATEGORIES[0];

    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      const isVideo = file.type.startsWith('video/');

      // Convert image files to data URLs so they persist in localStorage and can be drawn on canvas
      let url = '';
      if (!isVideo) {
        url = await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onload = ev => resolve((ev.target?.result as string) || URL.createObjectURL(file));
          reader.onerror = () => resolve(URL.createObjectURL(file));
          reader.readAsDataURL(file);
        });
      } else {
        url = URL.createObjectURL(file);
        try {
          const uploadedUrl = await uploadMedia(project.id, file);
          if (uploadedUrl) url = uploadedUrl;
        } catch {
          // Keep object URL fallback
        }
      }

      const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const itemCaption = uploadCaptionPrefix.trim()
        ? stagedFiles.length > 1
          ? `${uploadCaptionPrefix.trim()} (#${i + 1})`
          : uploadCaptionPrefix.trim()
        : `${phaseMeta.shortLabel} — ${cleanFileName}`;

      const itemTags = Array.from(
        new Set([
          phaseMeta.shortLabel,
          uploadDamageType,
          roomName,
          ...uploadTags
        ])
      );

      if (isVideo) {
        const thumb = await generateVideoThumbnail(file);
        newVideos.push({
          id: `vid-${Date.now()}-${i}`,
          url,
          thumbnail: thumb,
          timestamp: Date.now(),
          caption: itemCaption,
          description: `${phaseMeta.shortLabel} (${uploadDamageType}) in ${roomName}. ${
            uploadMeterReading ? `Meter: ${uploadMeterReading}.` : ''
          }`.trim(),
          phaseCategory: uploadPhase,
          damageType: uploadDamageType,
          roomName,
          tags: itemTags,
          linkedRoomId: targetRoom?.id,
          videoAnnotations: []
        });
      } else {
        newPhotos.push({
          id: `media-${Date.now()}-${i}`,
          url,
          originalUrl: url,
          timestamp: Date.now(),
          caption: itemCaption,
          phaseCategory: uploadPhase,
          damageType: uploadDamageType,
          roomName,
          linkedRoomId: targetRoom?.id,
          meterReading: uploadMeterReading.trim() || undefined,
          tags: itemTags,
          notes: `${itemCaption} · ${uploadDamageType} in ${roomName}${
            uploadMeterReading ? ` · Meter Reading: ${uploadMeterReading}` : ''
          }`,
          type: 'image'
        });
      }
    }

    if (onUpdate) {
      const updatedRooms = [...(project.rooms || [])];
      if (updatedRooms.length === 0) {
        updatedRooms.push({
          id: `room-${Date.now()}`,
          name: 'General Area',
          dimensions: { length: 15, width: 15, height: 8 },
          readings: [],
          photos: [],
          status: 'wet'
        });
      }

      const roomIdx = Math.max(
        0,
        updatedRooms.findIndex(r => r.id === (targetRoom?.id || updatedRooms[0].id))
      );
      updatedRooms[roomIdx] = {
        ...updatedRooms[roomIdx],
        photos: [...newPhotos, ...(updatedRooms[roomIdx].photos || [])]
      };

      const updatedVideos = [...newVideos, ...(project.videos || [])];
      onUpdate({
        rooms: updatedRooms,
        videos: updatedVideos
      });
    }

    setStagedFiles([]);
    setUploadCaptionPrefix('');
    setUploadMeterReading('');
    setIsProcessing(false);
    setIsUploadModalOpen(false);

    EventBus.publish(
      'com.restorationai.log.entry',
      {
        message: `Uploaded & categorized ${newPhotos.length + newVideos.length} media file(s) under ${phaseMeta.shortLabel}`,
        category: 'Documentation'
      },
      project.id,
      'Media Uploaded & Categorized',
      'success'
    );
  };

  const handleAnalyzePhoto = async (photo: PhotoItem) => {
    if (!isOnline || !accessToken) return;
    setLoadingPhotos(prev => new Set(prev).add(photo.id));

    try {
      const router = new AIRouterClient();
      const imgResponse = await fetch(photo.url);
      if (!imgResponse.ok) {
        throw new Error(`Cannot load image (HTTP ${imgResponse.status}).`);
      }
      const blob = await imgResponse.blob();
      const base64Data = await blobToBase64(blob);

      const response = await router.analyzeWaterDamageImage(
        base64Data,
        project.aiLearnings || []
      );

      const result = JSON.parse(response.text || '{}');
      if (result.insight) {
        updateMediaItem(photo.id, {
          aiInsight: result.insight,
          notes: `${photo.notes ? photo.notes + '\n' : ''}AI Assessment: ${result.insight}`,
          tags: Array.from(new Set([...photo.tags, ...(result.tags || [])])),
          meterReading: result.meterReading || photo.meterReading,
          waterCategory: result.waterCategory || photo.waterCategory,
          affectedAreaEstimate: result.affectedAreaEstimate || photo.affectedAreaEstimate,
          damagedMaterials: result.damagedMaterials || photo.damagedMaterials,
          mitigationSteps: result.mitigationSteps || photo.mitigationSteps
        });

        EventBus.publish(
          'com.restorationai.log.entry',
          { message: `AI Insight for photo: ${result.insight}`, category: 'AI Vision' },
          project.id,
          'AI Insight Generated',
          'info'
        );
      }
    } catch (err) {
      console.error(err);
      EventBus.publish(
        'com.restorationai.notification',
        { title: 'Analysis Failed', message: 'Could not process photo' },
        project.id,
        'Photo Analysis Failed',
        'error'
      );
    } finally {
      setLoadingPhotos(prev => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
    }
  };

  // Render an individual media card with clean unboxed metadata (Zero-Pill Discipline)
  const renderMediaCard = (item: PhotoItem) => {
    const isSelected = selectedIds.has(item.id);
    const phaseMeta =
      PHASE_CATEGORIES.find(c => c.id === (item.phaseCategory || 'before')) ||
      PHASE_CATEGORIES[0];

    return (
      <div
        key={item.id}
        onClick={() => {
          setSelectedPhoto(item);
          setIsAnnotating(false);
        }}
        className={`group bg-slate-900 border rounded-xl overflow-hidden cursor-pointer flex flex-col transition-colors ${
          isSelected
            ? 'border-brand-cyan ring-1 ring-brand-cyan'
            : 'border-white/10 hover:border-white/25'
        }`}
      >
        {/* Thumbnail / Visual Frame */}
        <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
          <img
            src={item.type === 'video' ? item.thumbnailUrl || item.url : item.url}
            alt={item.caption || item.notes || 'Mitigation documentation media'}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            onError={e => {
              const target = e.currentTarget;
              target.style.display = 'none';
            }}
          />

          {/* Selection Checkbox */}
          <button
            type="button"
            onClick={e => toggleSelectItem(item.id, e)}
            className="absolute top-2.5 left-2.5 p-1.5 rounded-md bg-slate-950/80 text-white hover:bg-slate-900 transition-colors"
            title="Select for Batch Categorization"
          >
            {isSelected ? (
              <CheckSquare size={15} className="text-brand-cyan" />
            ) : (
              <Square size={15} className="text-slate-300" />
            )}
          </button>

          {/* Quick Annotate / Video Indicator */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            {item.type === 'image' && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setSelectedPhoto(item);
                  setIsAnnotating(true);
                }}
                className="px-2.5 py-1 rounded-md bg-slate-950/85 hover:bg-brand-cyan text-white hover:text-slate-950 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                title="Annotate Photo with Arrows, Flood-Cut Zones & Text Callouts"
              >
                <PenTool size={12} />
                <span>{item.isAnnotated ? 'Annotated' : 'Annotate'}</span>
              </button>
            )}
          </div>

          {item.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/25">
              <div className="w-11 h-11 rounded-full bg-slate-950/80 border border-white/20 flex items-center justify-center text-white">
                <Play size={20} fill="currentColor" />
              </div>
            </div>
          )}

          {/* Measured Contrast Scrim for Bottom Metadata */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-3 pt-8 flex items-end justify-between text-[11px] text-slate-200">
            <span className="font-semibold truncate">
              {phaseMeta.shortLabel}
              {item.roomName ? ` · ${item.roomName}` : ''}
              {item.meterReading ? ` · ${item.meterReading}` : ''}
            </span>
            <span className="font-mono text-[10px] text-slate-300 tabular-nums shrink-0 ml-2">
              {new Date(item.timestamp).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Card Body: Unboxed Metadata, Caption, and Tags */}
        <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
          <div>
            {/* Unboxed Metadata Kicker (Zero-Pill Discipline) */}
            <div className="text-[11px] text-slate-400 truncate">
              <span className="text-brand-cyan font-semibold">{phaseMeta.shortLabel}</span>
              <span aria-hidden="true"> · </span>
              <span>{item.damageType || 'General Water Mitigation'}</span>
            </div>

            {/* Primary Descriptive Caption */}
            <h4 className="text-sm font-semibold text-white mt-0.5 line-clamp-1">
              {item.caption || item.notes || 'Field Inspection Record'}
            </h4>

            {/* Secondary Notes Preview */}
            {item.notes && item.notes !== item.caption && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                {item.notes}
              </p>
            )}
          </div>

          {/* Unboxed Tag Trail & Quick Delete */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="truncate">
              {item.tags.length > 0 ? item.tags.join(' · ') : 'No tags'}
            </div>
            <button
              type="button"
              onClick={e => handleDeleteMedia(item.id, e)}
              className="text-slate-500 hover:text-rose-400 p-1 shrink-0"
              title="Delete Media"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const beforePhotos = useMemo(
    () => photos.filter(p => p.phaseCategory === 'before'),
    [photos]
  );
  const afterOrDuringPhotos = useMemo(
    () => photos.filter(p => p.phaseCategory === 'after' || p.phaseCategory === 'during'),
    [photos]
  );

  const activeCompareBefore =
    beforePhotos.find(p => p.id === compareBeforeId) || beforePhotos[0] || photos[0] || null;
  const activeCompareAfter =
    afterOrDuringPhotos.find(p => p.id === compareAfterId) ||
    afterOrDuringPhotos[0] ||
    photos[1] ||
    photos[0] ||
    null;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-200">
      {/* Top Workspace Header */}
      <header className="px-6 py-4 bg-slate-900 border-b border-white/10 flex flex-wrap justify-between items-center gap-4 shrink-0">
        {/* Left: Workspace Mode Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('gallery')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'gallery'
                ? 'bg-brand-cyan text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Media Evidence Library ({photos.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('video')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'video'
                ? 'bg-brand-cyan text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Video size={13} />
            <span>Video Walkthroughs ({(project.videos || []).length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mitigation')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'mitigation'
                ? 'bg-brand-cyan text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Sparkles size={13} />
            <span>S500 Damage Quantification</span>
          </button>
        </div>

        {/* Right: Primary Upload & Capture Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleStageFiles}
            accept="image/*,video/*"
            multiple
            className="hidden"
          />
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload size={14} />
            <span>Upload & Categorize Media</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Camera size={14} className="text-brand-cyan" />
            <span>Field Camera</span>
          </button>
        </div>
      </header>

      {showCamera && (
        <div className="fixed inset-0 z-[200] bg-slate-950">
          <MobileMediaCapture
            project={project}
            onUpdateProject={updates => {
              if (onUpdate) onUpdate(updates);
              setShowCamera(false);
            }}
            onClose={() => setShowCamera(false)}
          />
        </div>
      )}

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {activeTab === 'gallery' && (
          <>
            {/* Filtering, Categorization & View Controls Bar */}
            <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-4">
              {/* Row 1: Phase Segmented Filter + Layout Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Interactive Segmented Phase Filter */}
                <div
                  className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-white/10 overflow-x-auto"
                  role="tablist"
                  aria-label="Filter media by mitigation phase"
                >
                  <button
                    type="button"
                    onClick={() => setPhaseFilter('all')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                      phaseFilter === 'all'
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All Phases ({phaseCounts.all})
                  </button>
                  {PHASE_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPhaseFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        phaseFilter === cat.id
                          ? 'bg-brand-cyan text-slate-950 font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat.shortLabel} ({phaseCounts[cat.id] || 0})
                    </button>
                  ))}
                </div>

                {/* Layout View Mode Switcher */}
                <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => setLayoutMode('grid')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      layoutMode === 'grid'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Grid size={13} />
                    <span>Grid</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('timeline')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      layoutMode === 'timeline'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Layers size={13} />
                    <span>By Phase</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLayoutMode('compare')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      layoutMode === 'compare'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Columns size={13} />
                    <span>Before / After</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Search, Damage Type Filter, Room Filter, Media Type Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-2 border-t border-white/5">
                <div className="lg:col-span-4 relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search captions, tags, damage types, or notes..."
                    className="w-full bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  />
                </div>

                <div className="lg:col-span-3">
                  <select
                    value={damageTypeFilter}
                    onChange={e => setDamageTypeFilter(e.target.value)}
                    aria-label="Filter by specific damage type"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="all">All Specific Damage Types</option>
                    {DAMAGE_TYPE_OPTIONS.map(dt => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <select
                    value={roomFilter}
                    onChange={e => setRoomFilter(e.target.value)}
                    aria-label="Filter by room"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="all">All Rooms & Chambers</option>
                    {project.rooms?.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <select
                    value={mediaTypeFilter}
                    onChange={e =>
                      setMediaTypeFilter(
                        e.target.value as 'all' | 'image' | 'video' | 'annotated'
                      )
                    }
                    aria-label="Filter by media type"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="all">All Media Types</option>
                    <option value="image">Photos Only</option>
                    <option value="video">Videos Only</option>
                    <option value="annotated">Annotated Only</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Tag Quick Filter Buttons */}
              {allTags.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                  <span className="text-[11px] text-slate-500 shrink-0 mr-1">Tag Filter:</span>
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(tag)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                        tagFilter === tag
                          ? 'bg-white text-slate-950 font-semibold'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Batch Categorization Bar when items are selected */}
            {selectedIds.size > 0 && (
              <div className="bg-slate-900 border border-brand-cyan/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <SlidersHorizontal size={15} className="text-brand-cyan" />
                  <span className="font-bold text-white tabular-nums">
                    {selectedIds.size} media item(s) selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-400 hover:text-white underline ml-2"
                  >
                    Clear selection
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={batchPhase}
                    onChange={e => setBatchPhase(e.target.value as MediaPhaseCategory)}
                    className="bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {PHASE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        Phase: {c.shortLabel}
                      </option>
                    ))}
                  </select>

                  <select
                    value={batchDamageType}
                    onChange={e => setBatchDamageType(e.target.value)}
                    className="bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {DAMAGE_TYPE_OPTIONS.map(dt => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={batchTagInput}
                    onChange={e => setBatchTagInput(e.target.value)}
                    placeholder="Optional tag..."
                    className="bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white w-36"
                  />

                  <button
                    type="button"
                    onClick={handleApplyBatchCategorization}
                    className="px-3.5 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold whitespace-nowrap shrink-0"
                  >
                    Apply to Selected
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredPhotos.length === 0 && (
              <div className="bg-slate-900 border border-white/10 rounded-xl p-12 text-center space-y-3">
                <Camera size={36} className="mx-auto text-slate-500" />
                <h3 className="text-base font-bold text-white">
                  No Media Matches Current Filter Criteria
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Upload field photos or walkthrough videos and categorize them as Before, During, After, or Specific Damage Type to build an audit-ready visual record.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPhaseFilter('all');
                      setDamageTypeFilter('all');
                      setRoomFilter('all');
                      setMediaTypeFilter('all');
                      setTagFilter('All');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-semibold"
                  >
                    Reset Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(true)}
                    className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold"
                  >
                    Upload First Media File
                  </button>
                </div>
              </div>
            )}

            {/* MODE 1: GRID VIEW */}
            {layoutMode === 'grid' && filteredPhotos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredPhotos.map(item => renderMediaCard(item))}
              </div>
            )}

            {/* MODE 2: ORGANIZED BY MITIGATION PHASE TIMELINE */}
            {layoutMode === 'timeline' && filteredPhotos.length > 0 && (
              <div className="space-y-8">
                {PHASE_CATEGORIES.map(phase => {
                  const itemsInPhase = filteredPhotos.filter(
                    p => (p.phaseCategory || 'before') === phase.id
                  );
                  if (itemsInPhase.length === 0) return null;
                  return (
                    <section key={phase.id} className="space-y-3">
                      <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
                        <div>
                          <h3 className="text-base font-bold text-white">{phase.label}</h3>
                          <p className="text-xs text-slate-400">{phase.description}</p>
                        </div>
                        <span className="text-xs font-mono text-slate-400 tabular-nums">
                          {itemsInPhase.length} item(s)
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {itemsInPhase.map(item => renderMediaCard(item))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {/* MODE 3: BEFORE / AFTER SIDE-BY-SIDE COMPARISON */}
            {layoutMode === 'compare' && photos.length > 0 && (
              <div className="bg-slate-900 border border-white/10 rounded-xl p-6 space-y-5">
                <div className="border-b border-white/10 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Before vs. During / After Mitigation Comparison
                    </h3>
                    <p className="text-xs text-slate-400">
                      Compare pre-mitigation damage alongside active drying or post-remediation verification photos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                  {/* Left Column: Before */}
                  <div className="space-y-3 flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-400">
                        Baseline / Before Mitigation
                      </span>
                      <select
                        value={activeCompareBefore?.id || ''}
                        onChange={e => setCompareBeforeId(e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white max-w-xs truncate"
                      >
                        {photos.map(p => (
                          <option key={p.id} value={p.id}>
                            [{PHASE_CATEGORIES.find(c => c.id === p.phaseCategory)?.shortLabel || 'Before'}]{' '}
                            {p.caption || p.notes || p.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeCompareBefore && (
                      <div className="bg-slate-950 border border-white/10 rounded-xl overflow-hidden flex-1 flex flex-col">
                        <div className="aspect-[4/3] bg-black relative">
                          <img
                            src={
                              activeCompareBefore.type === 'video'
                                ? activeCompareBefore.thumbnailUrl || activeCompareBefore.url
                                : activeCompareBefore.url
                            }
                            alt={activeCompareBefore.caption || 'Before photo'}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="p-4 space-y-1">
                          <div className="text-xs text-slate-400">
                            {activeCompareBefore.roomName || 'Living Room'} ·{' '}
                            {activeCompareBefore.damageType || 'Initial Loss'}
                            {activeCompareBefore.meterReading
                              ? ` · Meter: ${activeCompareBefore.meterReading}`
                              : ''}
                          </div>
                          <div className="text-sm font-bold text-white">
                            {activeCompareBefore.caption || activeCompareBefore.notes}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: During / After */}
                  <div className="space-y-3 flex flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-400">
                        During Mitigation / Post-Drying Verification
                      </span>
                      <select
                        value={activeCompareAfter?.id || ''}
                        onChange={e => setCompareAfterId(e.target.value)}
                        className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white max-w-xs truncate"
                      >
                        {photos.map(p => (
                          <option key={p.id} value={p.id}>
                            [{PHASE_CATEGORIES.find(c => c.id === p.phaseCategory)?.shortLabel || 'After'}]{' '}
                            {p.caption || p.notes || p.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeCompareAfter && (
                      <div className="bg-slate-950 border border-white/10 rounded-xl overflow-hidden flex-1 flex flex-col">
                        <div className="aspect-[4/3] bg-black relative">
                          <img
                            src={
                              activeCompareAfter.type === 'video'
                                ? activeCompareAfter.thumbnailUrl || activeCompareAfter.url
                                : activeCompareAfter.url
                            }
                            alt={activeCompareAfter.caption || 'After photo'}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="p-4 space-y-1">
                          <div className="text-xs text-slate-400">
                            {activeCompareAfter.roomName || 'Living Room'} ·{' '}
                            {activeCompareAfter.damageType || 'Post-Mitigation'}
                            {activeCompareAfter.meterReading
                              ? ` · Meter: ${activeCompareAfter.meterReading}`
                              : ''}
                          </div>
                          <div className="text-sm font-bold text-white">
                            {activeCompareAfter.caption || activeCompareAfter.notes}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'video' && (
          <VideoLogger
            project={project}
            onUpdate={onUpdate}
            onExtractFrameToPhoto={extractedPhoto => {
              const photoItem: PhotoItem = { ...extractedPhoto, type: 'image' };
              if (onUpdate) {
                const updatedRooms = [...(project.rooms || [])];
                if (updatedRooms.length > 0) {
                  updatedRooms[0] = {
                    ...updatedRooms[0],
                    photos: [photoItem, ...(updatedRooms[0].photos || [])]
                  };
                  onUpdate({ rooms: updatedRooms });
                }
              }
              setPhotos(prev => [photoItem, ...prev]);
              setActiveTab('gallery');
              setSelectedPhoto(photoItem);
              setIsAnnotating(true);
            }}
          />
        )}

        {activeTab === 'mitigation' && (
          <div className="h-full -m-6">
            <WaterMitigationDocumentation
              project={project}
              onUpdateProject={onUpdate}
              onBack={() => setActiveTab('gallery')}
            />
          </div>
        )}
      </div>

      {/* --- UPLOAD & CATEGORIZE MEDIA STAGING MODAL --- */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <header className="px-6 py-4 border-b border-white/10 bg-slate-950/60 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Upload & Categorize Field Photos & Videos
                </h3>
                <p className="text-xs text-slate-400">
                  Assign mitigation phase, specific damage classification, descriptive captions, and tags.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleCommitStagedUpload} className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* File Dropzone */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1.5">
                  Select Photos or Walkthrough Videos *
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/15 hover:border-brand-cyan rounded-xl p-6 cursor-pointer bg-slate-950/50 transition-colors text-center">
                  <Upload size={24} className="text-brand-cyan mb-2" />
                  <span className="font-semibold text-white">
                    Click to select photos & videos from device
                  </span>
                  <span className="text-slate-400 mt-0.5">
                    Supports JPG, PNG, WEBP, MP4, WEBM, MOV (Multiple selection supported)
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleStageFiles}
                    className="hidden"
                  />
                </label>

                {stagedFiles.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {stagedFiles.map((f, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-200 flex items-center gap-2"
                      >
                        <span className="truncate max-w-[180px] font-medium">{f.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setStagedFiles(stagedFiles.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phase Category & Damage Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Mitigation Phase Category *
                  </label>
                  <select
                    value={uploadPhase}
                    onChange={e => setUploadPhase(e.target.value as MediaPhaseCategory)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {PHASE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel} — {c.description.slice(0, 38)}...
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Specific Damage Type *
                  </label>
                  <select
                    value={uploadDamageType}
                    onChange={e => setUploadDamageType(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {DAMAGE_TYPE_OPTIONS.map(dt => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Room & Meter Reading */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Assigned Room / Drying Chamber
                  </label>
                  <select
                    value={uploadRoomId}
                    onChange={e => setUploadRoomId(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {project.rooms?.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-300 block mb-1">
                    Associated Moisture Reading (Optional)
                  </label>
                  <input
                    type="text"
                    value={uploadMeterReading}
                    onChange={e => setUploadMeterReading(e.target.value)}
                    placeholder="e.g. 99.9% MC (Pin Meter)"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-cyan"
                  />
                </div>
              </div>

              {/* Descriptive Caption */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Descriptive Caption / Title
                </label>
                <input
                  type="text"
                  value={uploadCaptionPrefix}
                  onChange={e => setUploadCaptionPrefix(e.target.value)}
                  placeholder="e.g. East Wall Baseboard Saturation Prior to 2ft Flood Cut"
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-cyan"
                />
              </div>

              {/* Initial Tags */}
              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  Descriptive Tags ({uploadTags.length})
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={uploadCustomTag}
                    onChange={e => setUploadCustomTag(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (uploadCustomTag.trim()) {
                          setUploadTags(
                            Array.from(new Set([...uploadTags, uploadCustomTag.trim()]))
                          );
                          setUploadCustomTag('');
                        }
                      }
                    }}
                    placeholder="Add custom tag (e.g. Category 3, Subfloor)..."
                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (uploadCustomTag.trim()) {
                        setUploadTags(
                          Array.from(new Set([...uploadTags, uploadCustomTag.trim()]))
                        );
                        setUploadCustomTag('');
                      }
                    }}
                    className="px-3 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-lg"
                  >
                    Add Tag
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {uploadTags.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setUploadTags(uploadTags.filter(x => x !== t))}
                      className="px-2.5 py-1 rounded-md bg-slate-950 border border-white/15 text-slate-200 flex items-center gap-1"
                    >
                      <span>{t}</span>
                      <X size={11} />
                    </button>
                  ))}
                </div>
              </div>

              <footer className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-300 hover:bg-white/5 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={stagedFiles.length === 0 || isProcessing}
                  className="px-5 py-2.5 bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold rounded-lg flex items-center gap-1.5"
                >
                  {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>
                    Upload & Save {stagedFiles.length > 0 ? `(${stagedFiles.length})` : ''}
                  </span>
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* --- PHOTO / VIDEO DETAIL INSPECTOR & ANNOTATION MODAL --- */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
          <div className="relative w-full max-w-6xl bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col lg:flex-row max-h-[92vh]">
            {/* Left Viewport: Media Display or Interactive Canvas Annotator */}
            <div className="flex-1 bg-slate-950 flex flex-col min-h-[380px] relative">
              {selectedPhoto.type === 'video' ? (
                <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
                  <div className="aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                    <video
                      ref={detailVideoRef}
                      src={selectedPhoto.url}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Video Timestamp Callout & Frame Extraction Controls */}
                  <div className="bg-slate-900 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">
                        Video Frame Annotations & Still Extraction
                      </span>
                      <button
                        type="button"
                        onClick={handleExtractFrameFromModalVideo}
                        className="px-3 py-1.5 bg-brand-cyan/15 hover:bg-brand-cyan/25 border border-brand-cyan/40 text-brand-cyan rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Scissors size={13} />
                        <span>Capture Current Frame & Annotate</span>
                      </button>
                    </div>

                    <form onSubmit={handleAddVideoCalloutInModal} className="flex gap-2">
                      <input
                        type="text"
                        value={videoCalloutText}
                        onChange={e => setVideoCalloutText(e.target.value)}
                        placeholder="Add timestamped note at current playback second..."
                        className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                      />
                      <button
                        type="submit"
                        disabled={!videoCalloutText.trim()}
                        className="px-3.5 py-2 bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <Plus size={13} />
                        <span>Add Callout</span>
                      </button>
                    </form>

                    {selectedPhoto.videoAnnotations && selectedPhoto.videoAnnotations.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {selectedPhoto.videoAnnotations.map(ann => (
                          <div
                            key={ann.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-white/5 text-xs"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (detailVideoRef.current) {
                                  detailVideoRef.current.currentTime = ann.timestampSec;
                                  detailVideoRef.current.play().catch(() => {});
                                }
                              }}
                              className="font-mono text-brand-cyan font-bold flex items-center gap-1 hover:underline tabular-nums"
                            >
                              <Clock size={12} />
                              <span>{ann.timestampSec}s</span>
                            </button>
                            <span className="text-slate-200 flex-1 ml-3">{ann.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : isAnnotating ? (
                <ImageAnnotator
                  imageUrl={selectedPhoto.url}
                  originalImageUrl={selectedPhoto.originalUrl}
                  onSave={handleSaveAnnotation}
                  onCancel={() => setIsAnnotating(false)}
                />
              ) : (
                <div className="flex-1 flex flex-col">
                  {/* Image Action Bar */}
                  <div className="px-4 py-3 bg-slate-900/90 border-b border-white/10 flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-400 font-mono tabular-nums">
                      {new Date(selectedPhoto.timestamp).toLocaleString()}
                      {selectedPhoto.isAnnotated ? ' · Annotated Copy' : ' · Original Capture'}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedPhoto.isAnnotated && selectedPhoto.originalUrl && (
                        <button
                          type="button"
                          onClick={handleRevertAnnotation}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                        >
                          <RotateCcw size={13} />
                          <span>Revert to Original</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsAnnotating(true)}
                        className="px-3.5 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5"
                      >
                        <PenTool size={13} />
                        <span>Annotate Photo</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                    <img
                      src={selectedPhoto.url}
                      alt={selectedPhoto.caption || 'Selected field photo'}
                      className="max-w-full max-h-[68vh] object-contain rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right Inspector Sidebar: Categorization, Caption, Tags, Associations & Notes */}
            <div className="w-full lg:w-[400px] border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col bg-slate-900 overflow-y-auto space-y-5">
              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white">
                    Media Categorization & Metadata
                  </h3>
                  <p className="text-xs text-slate-400">
                    Changes commit immediately to the project dossier.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPhoto(null);
                    setIsAnnotating(false);
                  }}
                  className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Descriptive Caption Input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Descriptive Caption / Title
                </label>
                <input
                  type="text"
                  value={selectedPhoto.caption || ''}
                  onChange={e => updateMediaItem(selectedPhoto.id, { caption: e.target.value })}
                  placeholder="Enter a clear, descriptive title..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                />
              </div>

              {/* Phase Category & Specific Damage Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Mitigation Phase
                  </label>
                  <select
                    value={selectedPhoto.phaseCategory || 'before'}
                    onChange={e =>
                      updateMediaItem(selectedPhoto.id, {
                        phaseCategory: e.target.value as MediaPhaseCategory
                      })
                    }
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {PHASE_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Specific Damage Type
                  </label>
                  <select
                    value={selectedPhoto.damageType || DAMAGE_TYPE_OPTIONS[0]}
                    onChange={e =>
                      updateMediaItem(selectedPhoto.id, { damageType: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  >
                    {DAMAGE_TYPE_OPTIONS.map(dt => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Room, Meter Reading & Equipment Associations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Room / Drying Chamber
                  </label>
                  <select
                    value={selectedPhoto.linkedRoomId || ''}
                    onChange={e => {
                      const roomObj = project.rooms?.find(r => r.id === e.target.value);
                      updateMediaItem(selectedPhoto.id, {
                        linkedRoomId: e.target.value,
                        roomName: roomObj?.name || 'General Area'
                      });
                    }}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  >
                    <option value="">General Area</option>
                    {project.rooms?.map(room => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Meter Reading (% MC / GPP)
                  </label>
                  <input
                    type="text"
                    value={selectedPhoto.meterReading || ''}
                    onChange={e =>
                      updateMediaItem(selectedPhoto.id, { meterReading: e.target.value })
                    }
                    placeholder="e.g. 28.4% MC"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-cyan"
                  />
                </div>
              </div>

              {/* Descriptive Tags Section */}
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-slate-300 block">
                  Assigned Tags ({selectedPhoto.tags.length})
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {selectedPhoto.tags.length > 0 ? (
                    selectedPhoto.tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(selectedPhoto.id, tag)}
                        className="px-2.5 py-1 bg-slate-950 border border-brand-cyan/40 rounded-md text-[11px] font-medium text-brand-cyan flex items-center gap-1 hover:border-rose-500/50 hover:text-rose-300 transition-colors"
                      >
                        <span>{tag}</span>
                        <X size={11} />
                      </button>
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">No tags assigned</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTag}
                    onChange={e => setCustomTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomTag(selectedPhoto.id)}
                    placeholder="Add custom tag..."
                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-cyan"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomTag(selectedPhoto.id)}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-xs font-semibold text-white"
                  >
                    Add
                  </button>
                </div>

                {/* Suggested Tag Categories */}
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1 pt-1">
                  {Object.entries(SUGGESTED_TAGS).map(([category, tags]) => (
                    <div key={category}>
                      <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                        {category}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {tags.map(tag => {
                          const active = selectedPhoto.tags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(selectedPhoto.id, tag)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                active
                                  ? 'bg-brand-cyan text-slate-950 font-semibold'
                                  : 'bg-slate-950 text-slate-400 border border-white/5 hover:text-white'
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Field Notes & Voice Dictation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">
                    Detailed Technician Notes & Caption Prose
                  </label>
                  <button
                    type="button"
                    onClick={toggleDictation}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                      isRecordingDictation
                        ? 'bg-rose-600 text-white'
                        : 'bg-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    {isRecordingDictation ? <MicOff size={12} /> : <Mic size={12} />}
                    <span>{isRecordingDictation ? 'Stop Dictation' : 'Voice Dictate'}</span>
                  </button>
                </div>
                <textarea
                  value={selectedPhoto.notes}
                  onChange={e => updateNotes(selectedPhoto.id, e.target.value)}
                  rows={3}
                  placeholder="Document moisture boundaries, material salvageability, and IICRC S500 rationale..."
                  className="w-full bg-slate-950 border border-white/10 rounded-lg p-3 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-brand-cyan"
                />
                {selectedPhoto.notes && /\b(mold|mould)\b/i.test(selectedPhoto.notes) && (
                  <div className="bg-amber-950/50 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-200">
                    <strong>IICRC S520 Terminology Note:</strong> Use{' '}
                    <strong>&ldquo;suspected microbial growth&rdquo;</strong> rather than
                    &ldquo;mold&rdquo; unless an independent Industrial Hygienist lab report is attached.
                  </div>
                )}
              </div>

              {/* AI Vision Analysis Action */}
              {selectedPhoto.type === 'image' && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <button
                    type="button"
                    onClick={() => handleAnalyzePhoto(selectedPhoto)}
                    disabled={loadingPhotos.has(selectedPhoto.id)}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white rounded-lg font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loadingPhotos.has(selectedPhoto.id) ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Running S500 Vision Analysis...</span>
                      </>
                    ) : (
                      <>
                        <BrainCircuit size={14} className="text-brand-cyan" />
                        <span>
                          {selectedPhoto.aiInsight
                            ? 'Re-Analyze Damage with AI'
                            : 'Analyze Damage & Extract Tags'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoDocumentation;
