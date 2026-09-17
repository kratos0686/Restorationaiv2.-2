import React, { useState } from 'react';
import { Camera, Save, X, Calendar, Clock, User, MapPin, UploadCloud, CheckSquare, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { EventBus } from '../services/EventBus';
import { AIRouterClient } from '../services/AIRouterClient';
import Markdown from 'react-markdown';

interface DamageAssessmentFormProps {
  onComplete?: () => void;
}

const DamageAssessmentForm: React.FC<DamageAssessmentFormProps> = ({ onComplete }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().substring(0, 5),
    technicianName: '',
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    propertyAddress: '',
    waterDamageCategory: 'Category 1',
    waterDamageClass: 'Class 1',
    severity: 'minor',
    notes: ''
  });

  const [affectedAreas, setAffectedAreas] = useState<Record<string, boolean>>({
    basement: false,
    kitchen: false,
    bathroom: false,
    livingRoom: false,
    bedroom: false,
    hallway: false,
    laundryRoom: false,
  });

  const [affectedMaterials, setAffectedMaterials] = useState<Record<string, boolean>>({
    drywall: false,
    woodFlooring: false,
    carpet: false,
    insulation: false,
    subfloor: false,
    baseboards: false,
  });

  const [photos, setPhotos] = useState<{url: string, base64: string}[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAreaToggle = (area: string) => {
    setAffectedAreas(prev => ({ ...prev, [area]: !prev[area] }));
  };

  const handleMaterialToggle = (material: string) => {
    setAffectedMaterials(prev => ({ ...prev, [material]: !prev[material] }));
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => {
        const url = URL.createObjectURL(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotos(prev => [...prev, { url, base64: reader.result as string }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const router = new AIRouterClient();
      
      const projectContext = {
        formData,
        affectedAreas: Object.keys(affectedAreas).filter(k => affectedAreas[k]),
        affectedMaterials: Object.keys(affectedMaterials).filter(k => affectedMaterials[k]),
      };

      const imagesBase64 = photos.map(p => p.base64);

      const response = await router.generateComprehensiveReport('assessment', projectContext, imagesBase64);
      
      setGeneratedReport(response.text);

      EventBus.publish(
        'com.restorationai.assessment.submitted',
        { formData, affectedAreas, photosCount: photos.length },
        'Application',
        'Damage Assessment Report generated successfully',
        'success'
      );
    } catch (error) {
      console.error("Failed to generate report", error);
      alert("Failed to generate report. Please check API configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (generatedReport) {
    return (
      <div className="w-full h-full overflow-y-auto no-scrollbar p-6 bg-slate-950">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <FileText className="text-brand-cyan" size={28} />
                Preliminary Damage Report
              </h1>
            </div>
            <div className="flex gap-4">
              <button onClick={() => setGeneratedReport(null)} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors font-medium text-sm">
                Edit Assessment
              </button>
              {onComplete && (
                <button onClick={onComplete} className="px-4 py-2 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-lg transition-colors font-bold text-sm">
                  Finish
                </button>
              )}
            </div>
          </header>
          
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 prose prose-invert prose-cyan max-w-none">
            <div className="markdown-body">
              <Markdown>{generatedReport}</Markdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto no-scrollbar p-6 bg-slate-950">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between border-b border-white/10 pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <FileText className="text-brand-cyan" size={28} />
              Damage Assessment Report
            </h1>
            <p className="text-sm text-slate-400 mt-1">Complete the initial site assessment and water damage categorization.</p>
          </div>
          {onComplete && (
            <button onClick={onComplete} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400">
              <X size={24} />
            </button>
          )}
        </header>

        <form onSubmit={handleSubmit} className="space-y-8 pb-12">
          {/* Section 1: Meta Information */}
          <section className="glass-card p-6 rounded-2xl border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <User size={20} className="text-brand-cyan" /> Assessment Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
                  <input type="date" name="date" value={formData.date} onChange={handleInputChange} required className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Time</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
                  <input type="time" name="time" value={formData.time} onChange={handleInputChange} required className="w-full bg-slate-900 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Technician Name</label>
                <input type="text" name="technicianName" value={formData.technicianName} onChange={handleInputChange} placeholder="Lead Tech Name" required className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
              </div>
            </div>
          </section>

          {/* Section 2: Client Information */}
          <section className="glass-card p-6 rounded-2xl border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-brand-cyan" /> Client Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Client Name</label>
                <input type="text" name="clientName" value={formData.clientName} onChange={handleInputChange} placeholder="John Doe" required className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Property Address</label>
                <input type="text" name="propertyAddress" value={formData.propertyAddress} onChange={handleInputChange} placeholder="123 Mitigation Lane, City, State ZIP" required className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Phone</label>
                <input type="tel" name="clientPhone" value={formData.clientPhone} onChange={handleInputChange} placeholder="(555) 123-4567" className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Email</label>
                <input type="email" name="clientEmail" value={formData.clientEmail} onChange={handleInputChange} placeholder="john@example.com" className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none" />
              </div>
            </div>
          </section>

          {/* Section 3: Damage Classification */}
          <section className="glass-card p-6 rounded-2xl border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-500" /> Damage Classification
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Water Category</label>
                <select name="waterDamageCategory" value={formData.waterDamageCategory} onChange={handleInputChange} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none">
                  <option value="Category 1">Category 1 (Sanitary Water)</option>
                  <option value="Category 2">Category 2 (Significantly Contaminated Water)</option>
                  <option value="Category 3">Category 3 (Grossly Contaminated Water)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 px-1">Source of the water and level of contamination.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Water Class</label>
                <select name="waterDamageClass" value={formData.waterDamageClass} onChange={handleInputChange} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none">
                  <option value="Class 1">Class 1 (Least)</option>
                  <option value="Class 2">Class 2 (Large)</option>
                  <option value="Class 3">Class 3 (Greatest)</option>
                  <option value="Class 4">Class 4 (Specialty)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 px-1">Estimated rate of evaporation based on materials.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Severity Level</label>
                <select name="severity" value={formData.severity} onChange={handleInputChange} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-cyan outline-none">
                  <option value="minor">Minor (Localized)</option>
                  <option value="moderate">Moderate (Multi-Room)</option>
                  <option value="severe">Severe (Structural)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-1 px-1">Overall impact on the property structure.</p>
              </div>
            </div>
          </section>

          {/* Section 4: Affected Areas & Materials */}
          <section className="glass-card p-6 rounded-2xl border border-white/10 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <CheckSquare size={20} className="text-brand-cyan" /> Affected Areas
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.keys(affectedAreas).map(area => (
                  <label key={area} className={`flex items-center space-x-3 p-3 rounded-xl border transition-colors cursor-pointer ${affectedAreas[area] ? 'bg-brand-cyan/20 border-brand-cyan text-white' : 'bg-slate-900 border-white/10 text-slate-400 hover:border-white/20'}`}>
                    <input type="checkbox" checked={affectedAreas[area]} onChange={() => handleAreaToggle(area)} className="w-4 h-4 text-brand-cyan rounded border-white/20 bg-slate-950 focus:ring-brand-cyan focus:ring-offset-slate-900" />
                    <span className="capitalize font-medium text-sm">
                      {area.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            
            <div className="pt-4 border-t border-white/10">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" /> Affected Materials
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.keys(affectedMaterials).map(material => (
                  <label key={material} className={`flex items-center space-x-3 p-3 rounded-xl border transition-colors cursor-pointer ${affectedMaterials[material] ? 'bg-amber-500/20 border-amber-500 text-white' : 'bg-slate-900 border-white/10 text-slate-400 hover:border-white/20'}`}>
                    <input type="checkbox" checked={affectedMaterials[material]} onChange={() => handleMaterialToggle(material)} className="w-4 h-4 text-amber-500 rounded border-white/20 bg-slate-950 focus:ring-amber-500 focus:ring-offset-slate-900" />
                    <span className="capitalize font-medium text-sm">
                      {material.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* Section 5: Photos & Evidence */}
          <section className="glass-card p-6 rounded-2xl border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Camera size={20} className="text-brand-cyan" /> Photographic Evidence
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {photos.map((photo, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden group border border-white/10">
                  <img src={photo.url} alt={`Damage ${index + 1}`} className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removePhoto(index)} className="absolute top-2 right-2 bg-slate-950/80 hover:bg-red-500 transition-colors p-1.5 rounded-full text-white opacity-0 group-hover:opacity-100">
                    <X size={14} />
                  </button>
                </div>
              ))}
              
              <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-white/20 hover:border-brand-cyan hover:bg-brand-cyan/5 transition-colors rounded-xl cursor-pointer">
                <UploadCloud size={32} className="text-slate-400 mb-2" />
                <span className="text-xs font-bold text-slate-400">Upload Photo</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
          </section>

          {/* Section 6: Detailed Notes */}
          <section className="glass-card p-6 rounded-2xl border border-white/10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FileText size={20} className="text-brand-cyan" /> Detailed Notes
            </h2>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={4}
              placeholder="Describe the source of water, extent of damage, pre-existing conditions, safety hazards, and preliminary action plan..."
              className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-brand-cyan outline-none resize-none"
            ></textarea>
          </section>

          <footer className="pt-4 flex justify-end items-center gap-4">
            {onComplete && (
              <button type="button" onClick={onComplete} className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 bg-brand-cyan hover:bg-cyan-400 text-slate-950 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)] hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Generating Report...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Generate Report
                </>
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default DamageAssessmentForm;

