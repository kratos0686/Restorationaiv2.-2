import React, { useState, useRef } from 'react';
import { Project, StatusUpdate } from '../types';
import { Send, Image as ImageIcon, CheckCircle2, Loader2, X, ExternalLink } from 'lucide-react';
import { blobToBase64 } from '../utils/photoutils';
import { EventBus } from '../services/EventBus';

interface ClientUpdatesLogProps {
  project: Project;
  onUpdate: (updates: Partial<Project>) => void;
}

const ClientUpdatesLog: React.FC<ClientUpdatesLogProps> = ({ project, onUpdate }) => {
  const [message, setMessage] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const base64 = await blobToBase64(file);
        setPhotos(prev => [...prev, base64]);
      }
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && photos.length === 0) return;

    setIsSubmitting(true);
    
    const newUpdate: StatusUpdate = {
      id: `su-${Date.now()}`,
      timestamp: new Date().toISOString(),
      message: message.trim(),
      author: 'Restoration Team', // Or from currentUser if available
      photos: photos.length > 0 ? photos : undefined
    };

    const currentUpdates = project.statusUpdates || [];
    const updatedProject = {
      ...project,
      statusUpdates: [...currentUpdates, newUpdate]
    };

    onUpdate(updatedProject);
    
    // Reset form
    setMessage('');
    setPhotos([]);
    setIsSubmitting(false);
    
    EventBus.publish('com.restorationai.project.status_updated', { projectId: project.id }, undefined, 'Client update posted successfully', 'success');
  };

  const portalUrl = `${window.location.origin}/portal/${project.id}`;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-white/10 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/50">
        <div>
          <h2 className="text-xl font-bold text-white">Client Portal Updates</h2>
          <p className="text-sm text-slate-400 mt-1">Post real-time status updates for the client.</p>
        </div>
        <a 
          href={portalUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center px-4 py-2 bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan rounded-lg transition-colors font-semibold text-sm"
        >
          View Portal <ExternalLink size={16} className="ml-2" />
        </a>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Post new update */}
        <form onSubmit={handleSubmit} className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a progress update (e.g., 'Water extraction complete in the basement', 'Dehumidifiers placed')..."
            className="w-full bg-slate-900 border border-white/10 rounded-lg p-3 text-white placeholder-slate-500 focus:outline-none focus:border-brand-cyan/50 resize-none min-h-[100px] mb-4"
          />
          
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-white/20">
                  <img src={photo} alt="Upload preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(idx)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center text-slate-400 hover:text-brand-cyan transition-colors text-sm font-medium"
            >
              <ImageIcon size={18} className="mr-2" /> Add Photos
            </button>
            <input 
              type="file" 
              accept="image/*" 
              multiple 
              className="hidden" 
              ref={fileInputRef}
              onChange={handlePhotoSelect}
            />
            
            <button
              type="submit"
              disabled={isSubmitting || (!message.trim() && photos.length === 0)}
              className="flex items-center px-4 py-2 bg-brand-cyan text-slate-900 rounded-lg font-bold disabled:opacity-50 transition-colors hover:bg-cyan-400"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin mr-2" /> : <Send size={16} className="mr-2" />}
              Post Update
            </button>
          </div>
        </form>

        {/* Timeline of updates */}
        <div className="space-y-6 pt-4">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-white/5 pb-2">Recent Updates</h3>
          
          {(!project.statusUpdates || project.statusUpdates.length === 0) ? (
            <p className="text-slate-500 text-sm italic">No updates have been posted to the client portal yet.</p>
          ) : (
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 md:before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
              {[...project.statusUpdates].reverse().map(update => (
                <div key={update.id} className="relative flex items-start gap-4 group">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-slate-900 text-brand-cyan shadow shrink-0 z-10 mt-1">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-white text-sm">{update.author}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(update.timestamp).toLocaleDateString()} {new Date(update.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mb-3 leading-relaxed whitespace-pre-wrap">{update.message}</p>
                    
                    {update.photos && update.photos.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {update.photos.map((photo, idx) => (
                          <div key={idx} className="w-24 h-24 rounded-lg overflow-hidden border border-white/10">
                            <img src={photo} alt={`Update ${idx + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientUpdatesLog;
