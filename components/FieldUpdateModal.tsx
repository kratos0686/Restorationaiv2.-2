import React, { useState } from 'react';
import { Project, DailyNarrative } from '../types';
import { Camera, Clock, Check, X, FileText, Upload } from 'lucide-react';
import { EventBus } from '../services/EventBus';
import { useAppContext } from '../context/AppContext';
import { updateProject } from '../services/api';

interface FieldUpdateModalProps {
  project: Project;
  onClose: () => void;
  onUpdate: (updates: Partial<Project>) => void;
}

export const FieldUpdateModal: React.FC<FieldUpdateModalProps> = ({ project, onClose, onUpdate }) => {
  const { currentUser } = useAppContext();
  const [notes, setNotes] = useState('');
  const [hours, setHours] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // Fake photo upload - in a real app this goes to Cloud Storage
      const newPhotos = Array.from(files).map((f, i) => `photo_url_${Date.now()}_${i}`);
      setPhotos([...photos, ...newPhotos]);
    }
  };

  const handleSubmit = async () => {
    if (!notes.trim()) return;
    setIsSubmitting(true);
    
    try {
      const timeSpent = parseFloat(hours) || 0;
      
      const newUpdate: DailyNarrative = {
        id: `update_${Date.now()}`,
        date: new Date().toLocaleDateString(),
        timestamp: Date.now(),
        content: notes,
        author: currentUser?.name || 'Technician',
        tags: ['Field Update'],
        generated: false,
        entryType: 'field_update',
        timeSpent,
        attachments: photos
      };

      const updatedNarratives = [newUpdate, ...(project.dailyNarratives || [])];
      
      // Update Project
      await updateProject(project.id, { dailyNarratives: updatedNarratives });
      onUpdate({ dailyNarratives: updatedNarratives });

      // Publish Real-time Event
      EventBus.publish(
        'com.restorationai.field_update.logged',
        { projectId: project.id, updateId: newUpdate.id, timeSpent, photosCount: photos.length },
        project.address,
        `${currentUser?.name || 'Technician'} logged a field update (${timeSpent} hrs)`,
        'success'
      );

      onClose();
    } catch (error) {
      console.error('Failed to log update:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Check size={18} className="text-brand-cyan" /> Log Field Update
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <FileText size={14} /> Work Completed
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Briefly describe what was done on site today..."
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-slate-600 outline-none focus:border-brand-cyan min-h-[100px] resize-none"
            />
          </div>
          
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Clock size={14} /> Time on Site (Hrs)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="e.g. 2.5"
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white outline-none focus:border-brand-cyan"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Camera size={14} /> Attach Photos
              </label>
              <div className="relative w-full h-12 bg-black/40 border border-white/10 border-dashed rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors cursor-pointer overflow-hidden">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <span className="text-xs text-brand-cyan font-bold flex items-center gap-1">
                  <Upload size={14} /> {photos.length > 0 ? `${photos.length} Selected` : 'Browse'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-white/5 bg-black/20 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={!notes.trim() || isSubmitting}
            className="px-6 py-2 bg-brand-cyan text-slate-900 rounded-xl text-sm font-black disabled:opacity-50 hover:bg-cyan-400 transition-colors"
          >
            {isSubmitting ? 'Submitting...' : 'Post Update'}
          </button>
        </div>
      </div>
    </div>
  );
};
