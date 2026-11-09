import React, { useRef, useState, useEffect } from 'react';
import { PenTool, RotateCcw, Check, Trash2, ShieldCheck, User } from 'lucide-react';

export interface SignaturePadSavePayload {
  signatureDataUrl: string; // base64 PNG image (data:image/png;base64,...)
  signerName: string;
  signerRole?: string;
  signedAt: string;
  timestamp: number;
}

interface SignaturePadProps {
  label?: string;
  defaultSignerName?: string;
  defaultSignerRole?: string;
  existingSignatureDataUrl?: string;
  existingSignedAt?: string;
  onSave: (payload: SignaturePadSavePayload) => void;
  onClear?: () => void;
  compact?: boolean;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label = 'Technician Section Sign-Off',
  defaultSignerName = '',
  defaultSignerRole = 'IICRC Certified Technician',
  existingSignatureDataUrl,
  existingSignedAt,
  onSave,
  onClear,
  compact = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isEditingOverride, setIsEditing] = useState<boolean | null>(null);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [penColor, setPenColor] = useState<'#00d4aa' | '#38bdf8' | '#ffffff'>('#00d4aa');
  const [errorMsg, setErrorMsg] = useState('');

  const isEditing = isEditingOverride !== null ? isEditingOverride : !existingSignatureDataUrl;

  useEffect(() => {
    if (!isEditing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width > 0 ? rect.width : 420;
    const height = rect.height > 0 ? rect.height : compact ? 110 : 140;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [isEditing, compact, penColor]);

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    const mouseEvt = e as React.MouseEvent<HTMLCanvasElement>;
    return {
      x: mouseEvt.clientX - rect.left,
      y: mouseEvt.clientY - rect.top
    };
  };

  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = penColor;
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setStrokes((prev) => [...prev, snapshot]);

    setIsDrawing(true);
    setHasDrawn(true);
    if (errorMsg) setErrorMsg('');

    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleStopDraw = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previous = strokes[strokes.length - 1];
    ctx.putImageData(previous, 0, 0);
    setStrokes((prev) => prev.slice(0, prev.length - 1));
    if (strokes.length <= 1) {
      setHasDrawn(false);
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setHasDrawn(false);
  };

  const handleSaveSignature = () => {
    const trimmedName = signerName.trim() || defaultSignerName || 'Lead Technician';
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) {
      setErrorMsg('Draw signature on the pad before saving.');
      return;
    }

    const base64DataUrl = canvas.toDataURL('image/png');
    const now = Date.now();
    const formattedDate = new Date(now).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    onSave({
      signatureDataUrl: base64DataUrl,
      signerName: trimmedName,
      signerRole: defaultSignerRole,
      signedAt: formattedDate,
      timestamp: now
    });
    setIsEditing(false);
  };

  if (!isEditing && existingSignatureDataUrl) {
    return (
      <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              {label} · Verified Base64 e-Signature
            </div>
            <div className="text-xs font-bold text-white mt-0.5">
              Signed by {signerName || defaultSignerName || 'Lead Technician'}
              {existingSignedAt ? <span className="text-slate-400 font-normal"> · {existingSignedAt}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-1.5 flex items-center justify-center">
            <img
              src={existingSignatureDataUrl}
              alt={`Signature of ${signerName}`}
              className="h-10 max-w-[160px] object-contain"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              setHasDrawn(false);
              setStrokes([]);
            }}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition whitespace-nowrap"
          >
            Re-sign
          </button>
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition"
              title="Clear saved signature"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/90 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-black text-white uppercase tracking-wider">
          <PenTool size={13} className="text-brand-cyan" />
          <span>{label}</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-slate-500 font-bold uppercase">Ink:</span>
          {(['#00d4aa', '#38bdf8', '#ffffff'] as const).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setPenColor(color)}
              className={`w-4 h-4 rounded-full border ${
                penColor === color ? 'border-white scale-110' : 'border-transparent opacity-60'
              } transition`}
              style={{ backgroundColor: color }}
              title="Select signature ink color"
            />
          ))}
        </div>
      </div>

      {/* Signer Printed Name */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Signer Full Name & IICRC Cert #"
            className="w-full bg-slate-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white font-semibold focus:border-brand-cyan focus:outline-none"
          />
        </div>
      </div>

      {/* Interactive HTML5 Signature Canvas */}
      <div
        className={`relative w-full ${
          compact ? 'h-28' : 'h-36'
        } bg-slate-900 rounded-xl border-2 border-dashed border-white/15 overflow-hidden`}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair touch-none"
          onMouseDown={handleStartDraw}
          onMouseMove={handleDraw}
          onMouseUp={handleStopDraw}
          onMouseLeave={handleStopDraw}
          onTouchStart={handleStartDraw}
          onTouchMove={handleDraw}
          onTouchEnd={handleStopDraw}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-widest">
              Draw Signature Here (Finger, Stylus, or Mouse)
            </span>
            <span className="text-[10px] text-slate-600 mt-0.5">
              Saved directly as Base64 PNG in Project record
            </span>
          </div>
        )}
        <div className="absolute bottom-5 left-5 right-5 border-b border-white/10 pointer-events-none flex justify-between text-[9px] text-slate-600 font-mono">
          <span>✕ Sign Above Line</span>
          <span>IICRC S500 / E-SIGN Verification</span>
        </div>
      </div>

      {errorMsg && <p className="text-[11px] text-red-400 font-semibold">{errorMsg}</p>}

      {/* Controls */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-40 text-xs font-bold flex items-center gap-1 transition"
          >
            <RotateCcw size={12} /> Undo
          </button>
          <button
            type="button"
            onClick={handleClearCanvas}
            disabled={!hasDrawn}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 disabled:opacity-40 text-xs font-bold transition"
          >
            Clear
          </button>
          {existingSignatureDataUrl && (
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold transition"
            >
              Cancel
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleSaveSignature}
          disabled={!hasDrawn}
          className="px-4 py-1.5 rounded-xl bg-brand-cyan hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow transition active:scale-95"
        >
          <Check size={14} /> Save Section Sign-Off
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
