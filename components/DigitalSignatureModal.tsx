import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  RotateCcw, 
  ShieldCheck, 
  PenTool, 
  Type, 
  Lock, 
  Calendar, 
  User, 
  Briefcase 
} from 'lucide-react';

export interface SignatureResult {
  dataUrl: string;
  name: string;
  role: string;
  date: string;
  timestamp: number;
  auditHash: string;
}

interface DigitalSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (result: SignatureResult) => void;
  documentTitle: string;
  defaultName?: string;
  defaultRole?: string;
  roleOptions?: string[];
  subtitle?: string;
}

export const DigitalSignatureModal: React.FC<DigitalSignatureModalProps> = ({
  isOpen,
  onClose,
  onSave,
  documentTitle,
  defaultName = '',
  defaultRole = 'Lead Mitigation Technician',
  roleOptions = [
    'Lead Mitigation Technician',
    'Property Owner',
    'Tenant / Occupant',
    'Property Manager',
    'Insurance Adjuster',
    'Field Operations Supervisor'
  ],
  subtitle = 'ANSI / IICRC S500 Digital Verification & Electronic Legal Attestation'
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [penColor, setPenColor] = useState('#00d4aa'); // brand cyan
  const [inputMode, setInputMode] = useState<'draw' | 'type'>('draw');
  
  const [printedName, setPrintedName] = useState(defaultName);
  const [role, setRole] = useState(defaultRole);
  const [agreedToAttestation, setAgreedToAttestation] = useState(true);
  const [nameError, setNameError] = useState('');

  // Auto-generate audit stamp code
  const [auditHash] = useState(() => {
    const chars = '0123456789ABCDEF';
    let hash = 'SIG-';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) hash += '-';
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  });

  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Setup canvas
  useEffect(() => {
    if (!isOpen || inputMode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [isOpen, inputMode, penColor]);

  if (!isOpen) return null;

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    const mouseEvt = e as React.MouseEvent;
    return {
      x: mouseEvt.clientX - rect.left,
      y: mouseEvt.clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Save stroke snapshot for undo
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setStrokes((prev) => [...prev, snapshot]);

    setIsDrawing(true);
    setHasDrawn(true);
    const coords = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setHasDrawn(false);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const last = strokes[strokes.length - 1];
    ctx.putImageData(last, 0, 0);
    setStrokes((prev) => prev.slice(0, prev.length - 1));
    if (strokes.length <= 1) {
      setHasDrawn(false);
    }
  };

  const handleSave = () => {
    if (!printedName.trim()) {
      setNameError('Printed legal name is required.');
      return;
    }

    let finalDataUrl = '';
    if (inputMode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) {
        setNameError('Please draw your signature or switch to typed signature mode.');
        return;
      }
      finalDataUrl = canvas.toDataURL('image/png');
    } else {
      // Generate typed cursive script on an offscreen canvas
      const offscreen = document.createElement('canvas');
      offscreen.width = 600;
      offscreen.height = 180;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'transparent';
        ctx.fillRect(0, 0, 600, 180);
        ctx.font = 'italic 52px "Caveat", "Brush Script MT", "Segoe Script", cursive';
        ctx.fillStyle = penColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(printedName, 300, 90);
        finalDataUrl = offscreen.toDataURL('image/png');
      }
    }

    onSave({
      dataUrl: finalDataUrl,
      name: printedName.trim(),
      role,
      date: currentDate,
      timestamp: Date.now(),
      auditHash
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <header className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-cyan/15 text-brand-cyan flex items-center justify-center border border-brand-cyan/20">
              <PenTool size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                Digital Signature Authorization
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  Legal e-Sign
                </span>
              </h3>
              <p className="text-xs text-slate-400 truncate max-w-md">{documentTitle}</p>
              <p className="text-[10px] text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition"
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Signer Details Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                <User size={12} className="text-brand-cyan" /> Printed Legal Name *
              </label>
              <input
                type="text"
                value={printedName}
                onChange={(e) => {
                  setPrintedName(e.target.value);
                  if (nameError) setNameError('');
                }}
                placeholder="Full Legal Name"
                className={`w-full bg-slate-950 border ${nameError ? 'border-red-500/60' : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-brand-cyan transition text-sm font-semibold`}
              />
              {nameError && (
                <p className="text-[11px] text-red-400 font-medium mt-1">{nameError}</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1.5">
                <Briefcase size={12} className="text-brand-cyan" /> Signer Capacity / Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-cyan transition text-sm font-semibold cursor-pointer"
              >
                {roleOptions.map((opt) => (
                  <option key={opt} value={opt} className="bg-slate-900 text-white">
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mode Selector & Pen Color */}
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setInputMode('draw')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${inputMode === 'draw' ? 'bg-brand-cyan text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <PenTool size={13} /> Freehand Draw
              </button>
              <button
                type="button"
                onClick={() => setInputMode('type')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${inputMode === 'type' ? 'bg-brand-cyan text-slate-900 shadow' : 'text-slate-400 hover:text-white'}`}
              >
                <Type size={13} /> Type to Script
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Ink:</span>
              <button
                type="button"
                onClick={() => setPenColor('#00d4aa')}
                className={`w-5 h-5 rounded-full bg-[#00d4aa] border-2 ${penColor === '#00d4aa' ? 'border-white scale-110' : 'border-transparent opacity-70'} transition`}
                title="Restoration Cyan"
              />
              <button
                type="button"
                onClick={() => setPenColor('#38bdf8')}
                className={`w-5 h-5 rounded-full bg-sky-400 border-2 ${penColor === '#38bdf8' ? 'border-white scale-110' : 'border-transparent opacity-70'} transition`}
                title="Signature Blue"
              />
              <button
                type="button"
                onClick={() => setPenColor('#ffffff')}
                className={`w-5 h-5 rounded-full bg-white border-2 ${penColor === '#ffffff' ? 'border-brand-cyan scale-110' : 'border-transparent opacity-70'} transition`}
                title="Clean White"
              />
            </div>
          </div>

          {/* Signature Canvas / Typed Area */}
          {inputMode === 'draw' ? (
            <div className="space-y-2">
              <div className="relative w-full h-44 bg-slate-950 rounded-2xl border-2 border-dashed border-white/15 overflow-hidden group">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 pointer-events-none space-y-1">
                    <PenTool size={22} className="opacity-40 animate-pulse text-brand-cyan" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Sign with finger, stylus, or mouse
                    </span>
                    <span className="text-[10px] text-slate-600">Cross the signature baseline below</span>
                  </div>
                )}
                {/* Visual signature baseline */}
                <div className="absolute bottom-8 left-8 right-8 border-b border-white/10 pointer-events-none flex justify-between items-center text-[10px] text-slate-600 font-mono">
                  <span>✕ Sign on line</span>
                  <span>{currentDate}</span>
                </div>
              </div>

              {/* Canvas Controls */}
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Strokes: {strokes.length}</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={strokes.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 flex items-center gap-1 transition text-xs font-bold"
                  >
                    <RotateCcw size={12} /> Undo
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={!hasDrawn && strokes.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 disabled:opacity-40 flex items-center gap-1 transition text-xs font-bold"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-950 rounded-2xl border-2 border-dashed border-white/15 min-h-[176px] flex flex-col items-center justify-center text-center space-y-2">
              <div 
                className="text-4xl text-brand-cyan font-serif italic py-4"
                style={{
                  fontFamily: '"Caveat", "Brush Script MT", "Segoe Script", cursive',
                  color: penColor
                }}
              >
                {printedName || 'Preview Signature'}
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Typed Script Signature • Bound to: {printedName || '[Awaiting Name]'}
              </div>
            </div>
          )}

          {/* Legal Attestation & Audit Fingerprint */}
          <div className="p-3.5 bg-slate-950/70 border border-white/5 rounded-2xl space-y-2.5">
            <label className="flex items-start space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreedToAttestation}
                onChange={(e) => setAgreedToAttestation(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-slate-900 text-brand-cyan focus:ring-brand-cyan h-4 w-4"
              />
              <span className="text-xs text-slate-300 leading-snug">
                I acknowledge and declare that this digital signature is legally binding, executed in accordance with the U.S. Electronic Signatures in Global and National Commerce (E-SIGN) Act and Uniform Electronic Transactions Act (UETA).
              </span>
            </label>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <div className="flex items-center gap-1.5">
                <Lock size={11} className="text-emerald-400" />
                <span>Audit ID: <strong className="text-slate-300">{auditHash}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={11} />
                <span>{currentDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-white/5 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition text-xs font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!agreedToAttestation || (inputMode === 'draw' && !hasDrawn) || !printedName.trim()}
            className="px-6 py-2.5 bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition"
          >
            <ShieldCheck size={16} /> Save & Apply Signature
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DigitalSignatureModal;
