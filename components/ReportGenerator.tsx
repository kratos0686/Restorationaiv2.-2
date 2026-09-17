import React, { useState, useEffect, useRef } from 'react';
import { Project, Photo } from '../types';
import { FileText, Edit2, Check, X, Printer, Camera, Download, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

import { useAppContext } from '../context/AppContext';
import { LogoIcon } from './Branding';
import { AIRouterClient } from '../services/AIRouterClient';

type ReportType = 'daily' | 'final' | 'insurance' | 'assessment' | 'psychrometric';

interface ReportGeneratorProps {
  reportType: ReportType;
  project: Project;
  onClose: () => void;
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ reportType, project, onClose }) => {
  const { settings } = useAppContext();
  const [isEditing, setIsEditing] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);
  const [isPhotoSelectorOpen, setIsPhotoSelectorOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);

  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const generateAiReport = async () => {
        if (!project) return;
        setIsGenerating(true);
        
        try {
            const router = new AIRouterClient();
            const response = await router.generateComprehensiveReport(reportType, {
                client: project.client,
                address: project.address,
                insurance: project.insurance,
                claimNumber: project.claimNumber,
                policyNumber: project.policyNumber,
                adjuster: project.adjuster,
                adjusterPhone: project.adjusterPhone,
                waterCategory: project.waterCategory,
                lossClass: project.lossClass,
                lossDate: project.lossDate,
                jobCompletedDate: project.jobCompletedDate,
                temperatureUnit: settings.units.temperature,
                equipment: project.equipment?.map(e => ({ type: e.type, status: e.status })),
                rooms: project.rooms?.map(r => ({
                    name: r.name,
                    dimensions: r.dimensions,
                    materials: r.materials,
                    latestReading: r.readings?.[r.readings.length - 1],
                    readingsHistory: r.readings || []
                })),
                dryingMonitor: project.dryingMonitor || [],
                dryingChambers: project.dryingChambers || [],
                lineItems: project.lineItems?.map(l => ({
                    code: l.code,
                    description: l.description,
                    quantity: l.quantity,
                    total: l.total
                })),
                photosInsight: project.rooms?.flatMap(r => r.photos).map(p => ({
                    insight: p.aiInsight,
                    category: p.waterCategory,
                    area: p.affectedAreaEstimate,
                    damagedMaterials: p.damagedMaterials,
                    mitigations: p.mitigationSteps
                })),
                technicianNotes: project.dailyNarratives?.map(n => ({ date: n.date, content: n.content, author: n.author }))
            });

            setReportContent(response.text || '');
        } catch (error) {
            console.error("Failed to generate AI report:", error);
            setReportContent(`# Error Generating Report\nThere was a problem compiling the report via AI. Please check your network connection or try again.`);
        } finally {
            setIsGenerating(false);
        }

        const photos = project.rooms?.flatMap(r => r.photos) || [];
        setSelectedPhotos(photos.slice(0, 4));
    };

    generateAiReport();
  }, [project, reportType, settings.units.temperature]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    
    // Slight pause to ensure styling is applied if any React states just changed
    await new Promise(r => setTimeout(r, 100));
    
    const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
    });
    
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(`${project?.client || 'Project'}_${reportType}_Report.pdf`.replace(/\s+/g, '_'));
  };

  if (!project) {
      return <div className="p-8 text-center text-slate-400">Loading...</div>;
  }

  const projectPhotos = project.rooms?.flatMap(r => r.photos) || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-hidden print:p-0 print:bg-white print:block pb-10">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-5xl h-full max-h-[90vh] flex flex-col shadow-2xl relative print:border-none print:shadow-none print:max-h-full print:h-auto print:bg-white print:text-black">
        {/* Header - Hidden in Print */}
        <div className="flex justify-between items-center p-4 border-b border-white/10 print:hidden shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-cyan/20 text-brand-cyan rounded-lg">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="font-bold text-white uppercase tracking-wider">
                {reportType === 'daily' ? 'Daily Mitigation Log' : reportType === 'final' ? 'Final Project Report' : reportType === 'assessment' ? 'Damage Assessment Report' : reportType === 'psychrometric' ? 'Psychrometric Status Report' : 'Insurance Claim Doc'}
              </h2>
              <p className="text-xs text-slate-400">{project.client} - {project.address}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)} 
                disabled={isGenerating}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium flex items-center space-x-2 disabled:opacity-50"
              >
                <Edit2 size={16} /> <span>Edit Content</span>
              </button>
            ) : (
                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-lg text-sm font-bold flex items-center space-x-2">
                <Check size={16} /> <span>Save</span>
              </button>
            )}
            <button onClick={() => setIsPhotoSelectorOpen(true)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium flex items-center space-x-2">
                <Camera size={16} /> <span>Photos ({selectedPhotos.length})</span>
            </button>
            <button onClick={handlePrint} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium flex items-center space-x-2">
              <Printer size={16} /> <span className="hidden sm:inline">Print</span>
            </button>
            <button onClick={handleDownloadPDF} className="px-3 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-900 rounded-lg text-sm font-bold flex items-center space-x-2">
              <Download size={16} /> <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={onClose} className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg ml-4">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
            <div ref={reportRef} className="max-w-4xl mx-auto bg-white text-slate-900 min-h-full p-10 rounded-xl shadow-lg print:shadow-none print:p-0 print:m-0 print:max-w-none relative">
                
                {isGenerating && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-xl">
                        <Loader2 className="w-12 h-12 text-brand-cyan animate-spin mb-4" />
                        <h3 className="text-xl font-bold text-slate-900">AI is compiling the report</h3>
                        <p className="text-slate-500">Analyzing project data and formatting...</p>
                    </div>
                )}

                {/* Letterhead */}
                <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end print:pb-4 print:mb-6">
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-950 p-1 flex-shrink-0 shadow-md">
                            <LogoIcon />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-900">RESTORATION AI</h1>
                            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest leading-none">Smart Solutions for Mitigation & Recovery</p>
                        </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                        <p className="font-bold">Restoration AI Corp</p>
                        <p>123 Recovery Lane, Suite 100</p>
                        <p>support@restorationai.com</p>
                        <p>1-800-555-0199</p>
                    </div>
                </div>

                {isEditing ? (
                    <textarea 
                        className="w-full h-[600px] p-4 bg-slate-50 border border-slate-300 rounded text-sm font-mono text-slate-800 focus:outline-brand-cyan"
                        value={reportContent}
                        onChange={(e) => setReportContent(e.target.value)}
                    />
                ) : (
                    <div className="markdown-body">
                        <ReactMarkdown>{reportContent}</ReactMarkdown>
                    </div>
                )}

                {/* Photos Section */}
                {selectedPhotos.length > 0 && !isEditing && (
                    <div className="mt-12 pt-8 border-t-2 border-slate-200 break-before-page">
                        <h2 className="text-xl font-bold mb-6 text-slate-900 border-b border-slate-200 pb-2">Photographic Evidence</h2>
                        <div className="grid grid-cols-2 gap-6">
                            {selectedPhotos.map((photo, i) => (
                                <div key={i} className="break-inside-avoid">
                                    <div className="aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-300">
                                        <img src={photo.url} alt="Evidence" className="w-full h-full object-cover" />
                                    </div>
                                    {photo.notes && <p className="text-xs text-slate-600 mt-2 italic">{photo.notes}</p>}
                                    {photo.aiInsight && <p className="text-xs text-brand-cyan mt-1 font-medium bg-cyan-50 p-1 rounded inline-block">{photo.aiInsight}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Photo Selector Modal */}
        {isPhotoSelectorOpen && (
            <div className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col pb-6 print:hidden">
                <div className="p-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="text-white font-bold text-lg flex items-center"><Camera className="mr-2"/> Select Photographic Evidence</h3>
                    <button onClick={() => setIsPhotoSelectorOpen(false)} className="text-white bg-brand-cyan/20 hover:bg-brand-cyan/40 px-4 py-2 rounded-lg font-bold">Done</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 gap-4">
                    {projectPhotos.length === 0 ? (
                         <div className="col-span-3 text-center text-slate-500 py-12">No photos available in this project.</div>
                    ) : projectPhotos.map(photo => {
                        const isSelected = selectedPhotos.some(p => p.id === photo.id);
                        return (
                            <div 
                                key={photo.id} 
                                onClick={() => {
                                    if (isSelected) {
                                        setSelectedPhotos(selectedPhotos.filter(p => p.id !== photo.id));
                                    } else {
                                        setSelectedPhotos([...selectedPhotos, photo]);
                                    }
                                }}
                                className={`relative aspect-video rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? 'border-brand-cyan ring-4 ring-brand-cyan/20' : 'border-transparent opacity-70 hover:opacity-100'}`}
                            >
                                <img src={photo.url} alt="Photo" className="w-full h-full object-cover" />
                                {isSelected && (
                                    <div className="absolute top-2 right-2 bg-brand-cyan text-slate-900 rounded-full p-1">
                                        <Check size={16} />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        )}
      </div>

    </div>
  );
}

export default ReportGenerator;
