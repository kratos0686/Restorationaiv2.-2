import React, { useState, useRef, useEffect } from 'react';
import { Save, Eraser, Pen } from 'lucide-react';

interface ImageAnnotatorProps {
  imageUrl: string;
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({ imageUrl, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ef4444'); // red by default
  const [lineWidth, setLineWidth] = useState(5);
  const [mode, setMode] = useState<'draw' | 'erase'>('draw');

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const image = new Image();
    
    // We need crossOrigin to allow saving the tainted canvas if it's external, but for object URLs it works fine
    image.crossOrigin = 'anonymous'; 
    image.src = imageUrl;
    image.onload = () => {
      if (canvas && ctx && containerRef.current) {
        // Match canvas dimensions to the image's intrinsic dimensions
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        
        // Draw the base image
        ctx.drawImage(image, 0, 0);
      }
    };
  }, [imageUrl]);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate scale between displayed size and actual size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const coords = getCoordinates(e);
    if (!coords) return;
    
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault(); // prevent scrolling on touch
    
    const coords = getCoordinates(e);
    if (!coords) return;
    
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      if (mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = lineWidth * 3;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(coords.x, coords.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleSave = () => {
    if (canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
      onSave(dataUrl);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 absolute inset-0 z-50">
      <div className="flex items-center justify-between p-4 bg-slate-800 border-b border-white/10">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setMode('draw')}
            className={`p-2 rounded-lg transition-colors ${mode === 'draw' ? 'bg-brand-cyan text-slate-900' : 'text-slate-300 hover:bg-white/10'}`}
            title="Draw"
          >
            <Pen className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setMode('erase')}
            className={`p-2 rounded-lg transition-colors ${mode === 'erase' ? 'bg-brand-cyan text-slate-900' : 'text-slate-300 hover:bg-white/10'}`}
            title="Erase"
          >
            <Eraser className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-white/20 mx-2" />
          <input 
            type="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border-0 p-0"
            disabled={mode === 'erase'}
          />
          <input 
            type="range" 
            min="1" 
            max="20" 
            value={lineWidth} 
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-24"
          />
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex items-center px-4 py-2 bg-brand-cyan text-slate-900 text-sm font-medium rounded-lg hover:bg-brand-cyan/90 transition-colors">
            <Save className="w-4 h-4 mr-2" />
            Save Annotation
          </button>
        </div>
      </div>
      
      <div ref={containerRef} className="flex-1 overflow-auto relative flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="max-w-full max-h-full object-contain cursor-crosshair border border-white/10 shadow-xl touch-none"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
    </div>
  );
};

export default ImageAnnotator;
