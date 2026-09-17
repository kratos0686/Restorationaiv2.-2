import React, { useEffect, useState } from 'react';
import { Project } from '../types';
import { getProjectById } from '../services/api';
import { Clock, Info, CheckCircle2, Loader2 } from 'lucide-react';

interface ClientPortalProps {
  projectId: string;
}

const ClientPortal: React.FC<ClientPortalProps> = ({ projectId }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      const data = await getProjectById(projectId);
      setProject(data);
      setLoading(false);
    };
    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-12 h-12 text-brand-cyan animate-spin" />
          <p className="text-slate-500 font-medium tracking-wide uppercase text-sm">Loading Project Information</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Project Not Found</h1>
        <p className="text-slate-500">The requested project details could not be loaded or the link has expired.</p>
      </div>
    );
  }

  // Calculate overall progress from stages
  const stages = ['Intake', 'Inspection', 'Scope', 'Stabilize', 'Monitor', 'Closeout'];
  const currentIndex = stages.indexOf(project.currentStage);
  const progressPercent = currentIndex >= 0 ? Math.round(((currentIndex + 1) / stages.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Restoration Status Portal</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">Project ID: {project.id}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
             <Info size={20} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 mt-8 space-y-8">
        {/* Project Info Card */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 mb-1">{project.client} Property</h2>
          <p className="text-sm text-slate-500 mb-6">{project.address}</p>
          
          <div className="space-y-3">
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Stage</p>
                <p className="text-sm font-semibold text-brand-cyan px-2.5 py-1 bg-brand-cyan/10 rounded-md inline-block">{project.currentStage}</p>
              </div>
              <p className="text-2xl font-black text-slate-800">{progressPercent}%</p>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-brand-cyan transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Real-time Updates Timeline */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-slate-400" /> 
            Live Status Updates
          </h3>
          
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
            {(!project.statusUpdates || project.statusUpdates.length === 0) ? (
               <div className="relative flex items-center justify-center p-8 text-slate-400 text-sm">
                 No updates have been posted yet.
               </div>
            ) : (
               [...project.statusUpdates].reverse().map((update) => (
                <div key={update.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-50 bg-brand-cyan text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <CheckCircle2 size={16} />
                  </div>
                  
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-5 rounded-2xl bg-white shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-900">{update.author}</span>
                      <time className="text-xs font-medium text-slate-400">{new Date(update.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(update.timestamp).toLocaleDateString()}</time>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-4">{update.message}</p>
                    
                    {update.photos && update.photos.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {update.photos.map((photo, idx) => (
                          <div key={idx} className="aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                            <img src={photo} alt="Site update" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500 cursor-pointer" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ClientPortal;
