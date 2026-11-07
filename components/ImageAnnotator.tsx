import React, { useState, useRef, useEffect } from 'react';
import {
  Save,
  Eraser,
  Pen,
  MoveUpRight,
  Square,
  Circle,
  Type,
  RotateCcw,
  RefreshCw,
  X
} from 'lucide-react';

interface ImageAnnotatorProps {
  imageUrl: string;
  originalImageUrl?: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

type AnnotationTool = 'pen' | 'arrow' | 'rect' | 'circle' | 'text' | 'erase';

const PRESET_COLORS = [
  { hex: '#ef4444', label: 'Hazard Red' },
  { hex: '#06b6d4', label: 'Mitigation Cyan' },
  { hex: '#f59e0b', label: 'Warning Amber' },
  { hex: '#10b981', label: 'Dry Emerald' },
  { hex: '#ffffff', label: 'Crisp White' }
];

const QUICK_FIELD_STAMPS = [
  '24" Flood Cut Line',
  '48" Flood Cut Line',
  '99.9% MC (Saturated)',
  'Dry Standard Verified (10% MC)',
  'Source of Loss / Valve',
  'Suspected Microbial Growth',
  'Subfloor Delamination'
];

const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({
  imageUrl,
  originalImageUrl,
  onSave,
  onCancel
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<AnnotationTool>('arrow');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth, setLineWidth] = useState(5);
  const [stampText, setStampText] = useState('24" Flood Cut Line');
  const [history, setHistory] = useState<ImageData[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [snapshotBeforeDrag, setSnapshotBeforeDrag] = useState<ImageData | null>(null);

  const loadCanvasImage = (srcUrl: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      baseImageRef.current = image;
      const w = image.naturalWidth || 960;
      const h = image.naturalHeight || 720;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(image, 0, 0, w, h);
      const initialSnap = ctx.getImageData(0, 0, w, h);
      setHistory([initialSnap]);
    };
    image.onerror = () => {
      // Fallback blank canvas if external image fails CORS
      canvas.width = 960;
      canvas.height = 720;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 960, 720);
      const initialSnap = ctx.getImageData(0, 0, 960, 720);
      setHistory([initialSnap]);
    };
    image.src = srcUrl;
  };

  useEffect(() => {
    loadCanvasImage(imageUrl);
  }, [imageUrl]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    const mouseEvt = e as React.MouseEvent;
    return {
      x: (mouseEvt.clientX - rect.left) * scaleX,
      y: (mouseEvt.clientY - rect.top) * scaleY
    };
  };

  const drawArrowhead = (
    ctx: CanvasRenderingContext2D,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius: number
  ) => {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - radius * Math.cos(angle - Math.PI / 6),
      toY - radius * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - radius * Math.cos(angle + Math.PI / 6),
      toY - radius * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  const drawTextStamp = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const canvas = canvasRef.current;
    const scaleFactor = canvas ? Math.max(1, canvas.width / 800) : 1;
    const fontSize = Math.round(20 * scaleFactor);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    const metrics = ctx.measureText(trimmed);
    const padX = Math.round(12 * scaleFactor);
    const padY = Math.round(8 * scaleFactor);
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;

    // High-contrast backing plate
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(2.5 * scaleFactor));
    ctx.beginPath();
    ctx.roundRect(x - boxW / 2, y - boxH / 2, boxW, boxH, 8 * scaleFactor);
    ctx.fill();
    ctx.stroke();

    // Label text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(trimmed, x, y);
    ctx.restore();
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!coords || !canvas || !ctx) return;

    const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'text') {
      drawTextStamp(ctx, coords.x, coords.y, stampText);
      const afterTextSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory(prev => [...prev, afterTextSnap]);
      return;
    }

    setIsDrawing(true);
    setStartPoint(coords);
    setSnapshotBeforeDrag(currentSnap);

    if (tool === 'pen' || tool === 'erase') {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const coords = getCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!coords || !canvas || !ctx) return;

    const scaleFactor = Math.max(1, canvas.width / 800);
    const effectiveWidth = lineWidth * scaleFactor;

    if (tool === 'pen' || tool === 'erase') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = tool === 'erase' ? '#0f172a' : color;
      ctx.lineWidth = tool === 'erase' ? effectiveWidth * 2.5 : effectiveWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      return;
    }

    if (!startPoint || !snapshotBeforeDrag) return;
    ctx.putImageData(snapshotBeforeDrag, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = effectiveWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
      drawArrowhead(
        ctx,
        startPoint.x,
        startPoint.y,
        coords.x,
        coords.y,
        Math.max(14, effectiveWidth * 3.2)
      );
    } else if (tool === 'rect') {
      const x = Math.min(startPoint.x, coords.x);
      const y = Math.min(startPoint.y, coords.y);
      const w = Math.abs(coords.x - startPoint.x);
      const h = Math.abs(coords.y - startPoint.y);
      ctx.strokeRect(x, y, w, h);
    } else if (tool === 'circle') {
      const rx = Math.abs(coords.x - startPoint.x) / 2;
      const ry = Math.abs(coords.y - startPoint.y) / 2;
      const cx = (startPoint.x + coords.x) / 2;
      const cy = (startPoint.y + coords.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistory(prev => [...prev, snap]);
    }
    setStartPoint(null);
    setSnapshotBeforeDrag(null);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || history.length <= 1) return;

    const nextHistory = history.slice(0, -1);
    const previousSnap = nextHistory[nextHistory.length - 1];
    ctx.putImageData(previousSnap, 0, 0);
    setHistory(nextHistory);
  };

  const handleResetToOriginal = () => {
    loadCanvasImage(originalImageUrl || imageUrl);
  };

  const handleSave = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.92);
      onSave(dataUrl);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 absolute inset-0 z-50">
      {/* Top Annotation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTool('arrow')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tool === 'arrow'
                ? 'bg-brand-cyan text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Draw Directional Callout Arrow"
          >
            <MoveUpRight size={14} />
            <span>Arrow</span>
          </button>

          <button
            type="button"
            onClick={() => setTool('rect')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tool === 'rect'
                ? 'bg-brand-cyan text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Outline Flood Cut or Affected Zone"
          >
            <Square size={14} />
            <span>Zone Box</span>
          </button>

          <button
            type="button"
            onClick={() => setTool('circle')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tool === 'circle'
                ? 'bg-brand-cyan text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Circle Valve or Meter Reading"
          >
            <Circle size={14} />
            <span>Spotlight</span>
          </button>

          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tool === 'pen'
                ? 'bg-brand-cyan text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Freehand Pen"
          >
            <Pen size={14} />
            <span>Freehand</span>
          </button>

          <button
            type="button"
            onClick={() => setTool('text')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tool === 'text'
                ? 'bg-brand-cyan text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Stamp Text Label on Photo"
          >
            <Type size={14} />
            <span>Label Stamp</span>
          </button>

          <button
            type="button"
            onClick={() => setTool('erase')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              tool === 'erase'
                ? 'bg-brand-cyan text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
            title="Eraser"
          >
            <Eraser size={14} />
            <span>Eraser</span>
          </button>

          <div className="w-px h-5 bg-white/10 mx-1" />

          {/* Color Palette */}
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map(c => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  color === c.hex ? 'border-white scale-110' : 'border-transparent opacity-75'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.label}
              />
            ))}
          </div>

          <input
            type="range"
            min="2"
            max="14"
            value={lineWidth}
            onChange={e => setLineWidth(parseInt(e.target.value, 10))}
            className="w-20 accent-brand-cyan ml-1"
            title="Stroke Width"
          />
        </div>

        {/* History & Save Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs font-semibold text-slate-300 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <RotateCcw size={13} />
            <span>Undo</span>
          </button>

          <button
            type="button"
            onClick={handleResetToOriginal}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <RefreshCw size={13} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <X size={14} />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 bg-brand-cyan hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Save size={14} />
            <span>Save Annotation</span>
          </button>
        </div>
      </div>

      {/* Contextual Text Stamp Bar when Label Stamp tool is active */}
      {tool === 'text' && (
        <div className="px-4 py-2 bg-slate-900/90 border-b border-white/10 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Click anywhere on photo to stamp:</span>
          <input
            type="text"
            value={stampText}
            onChange={e => setStampText(e.target.value)}
            placeholder="Custom field callout..."
            className="bg-slate-950 border border-white/15 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-brand-cyan w-56"
          />
          <div className="flex items-center gap-1 overflow-x-auto">
            {QUICK_FIELD_STAMPS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setStampText(preset)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  stampText === preset
                    ? 'bg-brand-cyan/20 text-brand-cyan border border-brand-cyan/40'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Canvas Area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto relative flex items-center justify-center p-4 bg-slate-950"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="max-w-full max-h-full object-contain cursor-crosshair border border-white/10 rounded-lg shadow-2xl touch-none"
        />
      </div>
    </div>
  );
};

export default ImageAnnotator;
