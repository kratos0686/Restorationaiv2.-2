
import React, { useState, Suspense } from 'react';
import { X, Palette, Download, FileImage, FileCode2, Box } from 'lucide-react';
import { RoomScan, PlacedPhoto } from '../types';
import { EventBus } from '../services/EventBus';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';

interface WalkthroughViewerProps {
  scan: RoomScan;
  onClose: () => void;
}

const PhotoPlane = ({ photo, dimensions, onSelect }: { photo: PlacedPhoto, dimensions: { width: number, height: number, length: number }, onSelect: (photo: PlacedPhoto) => void }) => {
  const texture = useTexture(photo.url || photo.thumbnailUrl || '');
  const [hovered, setHovered] = useState(false);
  
  const { width, height, length } = dimensions;
  
  // Default values
  let position: [number, number, number] = [0, 0, 0];
  let rotation: [number, number, number] = [0, 0, 0];
  
  const px = photo.position.x / 100;
  const py = photo.position.y / 100;
  
  const offset = 0.05;

  switch (photo.position.wall) {
    case 'floor':
      position = [
        -width/2 + px * width,
        -height/2 + offset,
        -length/2 + py * length
      ];
      rotation = [-Math.PI / 2, 0, 0];
      break;
    case 'ceiling':
      position = [
        -width/2 + px * width,
        height/2 - offset,
        -length/2 + py * length
      ];
      rotation = [Math.PI / 2, 0, 0];
      break;
    case 'front': // +Z
      position = [
        -width/2 + px * width,
        -height/2 + py * height,
        length/2 - offset
      ];
      rotation = [0, Math.PI, 0];
      break;
    case 'back': // -Z
      position = [
        -width/2 + px * width,
        -height/2 + py * height,
        -length/2 + offset
      ];
      rotation = [0, 0, 0];
      break;
    case 'left': // -X
      position = [
        -width/2 + offset,
        -height/2 + py * height,
        -length/2 + px * length
      ];
      rotation = [0, Math.PI / 2, 0];
      break;
    case 'right': // +X
      position = [
        width/2 - offset,
        -height/2 + py * height,
        -length/2 + px * length
      ];
      rotation = [0, -Math.PI / 2, 0];
      break;
  }

  // Calculate plane dimensions preserving aspect ratio
  const image = texture.image as HTMLImageElement | undefined;
  const aspect = image && image.width && image.height ? image.width / image.height : 1;
  const planeWidth = 3; // 3 units wide in the 3D space
  const planeHeight = planeWidth / aspect;

  return (
    <mesh 
      position={position} 
      rotation={rotation}
      onClick={(e) => { e.stopPropagation(); onSelect(photo); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
    >
      <planeGeometry args={[planeWidth, planeHeight]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} color={hovered ? '#ffffff' : '#cccccc'} />
      {/* Small marker / border */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(planeWidth, planeHeight)]} />
        <lineBasicMaterial color={hovered ? "#00d4aa" : "#ffffff"} linewidth={2} />
      </lineSegments>
      {hovered && (
        <Html distanceFactor={10} position={[0, planeHeight / 2 + 0.5, 0]} transform>
          <div className="bg-black/80 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-sm select-none pointer-events-none whitespace-nowrap border border-white/20 shadow-xl">
            {photo.tags?.[0] || 'View Photo'}
          </div>
        </Html>
      )}
    </mesh>
  );
};

const RoomModel = ({ dimensions }: { dimensions: { width: number, height: number, length: number } }) => {
  const { width, height, length } = dimensions;
  
  return (
    <group>
      {/* Solid walls with slight opacity */}
      <mesh>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial color="#1e293b" side={THREE.BackSide} transparent opacity={0.8} roughness={0.9} />
      </mesh>
      
      {/* Floor grid */}
      <gridHelper args={[Math.max(width, length), 10, '#00d4aa', '#334155']} position={[0, -height/2 + 0.01, 0]} />
      
      {/* Wireframe edges to define the room shape clearly */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, length)]} />
        <lineBasicMaterial color="#475569" linewidth={2} />
      </lineSegments>
    </group>
  );
};

const WalkthroughViewer: React.FC<WalkthroughViewerProps> = ({ scan, onClose }) => {
  const [selectedPhoto, setSelectedPhoto] = useState<PlacedPhoto | null>(null);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = (format: 'pdf' | 'jpg' | 'dxf' | 'esx') => {
    setShowExportMenu(false);
    EventBus.publish('com.restorationai.export', { format, roomName: scan.roomName }, undefined, `Exporting ${format.toUpperCase()}...`, 'info');
    
    setTimeout(() => {
        EventBus.publish('com.restorationai.export.complete', { format, roomName: scan.roomName }, undefined, `${format.toUpperCase()} Export Complete`, 'success');
        alert(`Simulated export of ${scan.roomName} 3D walkthrough as ${format.toUpperCase()}`);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-gray-950 z-[100] flex flex-col animate-in fade-in duration-300">
      <header className="flex items-center justify-between p-4 bg-gray-900/80 backdrop-blur-md text-white border-b border-white/10 z-20">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-cyan/20 rounded-lg"><Box size={20} className="text-brand-cyan"/></div>
          <div><h3 className="font-bold">{scan.roomName} 3D Walkthrough</h3><p className="text-[10px] uppercase font-bold text-slate-400">{scan.dimensions.sqft.toFixed(1)} SQ FT • {scan.dimensions.length}L x {scan.dimensions.width}W x {scan.dimensions.height}H (ft)</p></div>
        </div>
        
        <div className="flex items-center space-x-2 bg-black/40 rounded-lg p-1 border border-white/10 relative">
             {scan.materials && (
                 <button onClick={() => setShowMaterials(!showMaterials)} className={`p-2 rounded-md transition-all ${showMaterials ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-white'}`} title="View Materials"><Palette size={16} /></button>
             )}
             <button onClick={() => setShowExportMenu(!showExportMenu)} className={`p-2 rounded-md transition-all ${showExportMenu ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-slate-500 hover:text-white'}`} title="Export Walkthrough"><Download size={16} /></button>
             
             {showExportMenu && (
                 <div className="absolute top-full right-0 mt-2 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                     <div className="p-2 border-b border-white/10">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Visual Export</span>
                         <button onClick={() => handleExport('pdf')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center mt-1"><FileImage size={14} className="mr-2 text-brand-cyan"/> PDF Report</button>
                         <button onClick={() => handleExport('jpg')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center"><FileImage size={14} className="mr-2 text-brand-cyan"/> Snapshot Image</button>
                     </div>
                     <div className="p-2">
                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Data Export</span>
                         <button onClick={() => handleExport('dxf')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center mt-1"><FileCode2 size={14} className="mr-2 text-emerald-400"/> 3D Mesh (DXF)</button>
                         <button onClick={() => handleExport('esx')} className="w-full text-left px-2 py-2 text-sm text-white hover:bg-white/10 rounded-lg flex items-center"><FileCode2 size={14} className="mr-2 text-emerald-400"/> Xactimate (ESX)</button>
                     </div>
                 </div>
             )}
        </div>

        <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors ml-2"><X size={20} /></button>
      </header>

      <main className="flex-1 overflow-hidden relative bg-slate-950">
        {showMaterials && scan.materials && (
            <div className="absolute top-4 left-4 w-64 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 z-40 animate-in slide-in-from-left duration-300">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400">Material Matrix</h4>
                    <button onClick={() => setShowMaterials(false)} className="text-slate-500 hover:text-white"><X size={14}/></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Flooring</p>
                        <p className="text-sm text-white font-medium">{scan.materials.materials.flooring_system.material_category}</p>
                        <p className="text-[10px] text-slate-400 italic">{scan.materials.materials.flooring_system.grade_estimation}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Walls</p>
                        <p className="text-sm text-white font-medium">{scan.materials.materials.wall_system.substrate_material}</p>
                        <p className="text-[10px] text-slate-400 italic">{scan.materials.materials.wall_system.finish_type}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Trim</p>
                        <p className="text-sm text-white font-medium">{scan.materials.materials.trim_and_millwork.baseboard_material}</p>
                        <p className="text-[10px] text-slate-400 italic">{scan.materials.materials.trim_and_millwork.height_inches}" Height</p>
                    </div>
                </div>
            </div>
        )}
        
        <div className="w-full h-full cursor-grab active:cursor-grabbing">
          <Canvas 
            camera={{ position: [0, 0, 5], fov: 60 }} 
            style={{ width: '100%', height: '100%' }}
            gl={{ antialias: true }}
          >
            <ambientLight intensity={0.6} />
            <pointLight position={[0, scan.dimensions.height / 2 - 1, 0]} intensity={1.5} color="#ffffff" />
            <pointLight position={[scan.dimensions.width / 4, 0, scan.dimensions.length / 4]} intensity={0.5} color="#00d4aa" />
            
            <Suspense fallback={<Html center><div className="text-white text-sm font-bold bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">Loading 3D Models...</div></Html>}>
              <RoomModel dimensions={scan.dimensions} />
              {scan.placedPhotos?.map((photo, i) => (
                <PhotoPlane key={photo.id || i} photo={photo} dimensions={scan.dimensions} onSelect={setSelectedPhoto} />
              ))}
            </Suspense>

            <OrbitControls 
              enableDamping={true}
              dampingFactor={0.05}
              minDistance={1}
              maxDistance={Math.max(scan.dimensions.width, scan.dimensions.length) * 1.5}
            />
          </Canvas>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-10">
            <div className="bg-black/50 backdrop-blur-md text-white text-xs px-4 py-2 rounded-full border border-white/10 font-medium">
              Click & Drag to rotate • Scroll to zoom • Click photos to view details
            </div>
          </div>
        </div>
      </main>

      {selectedPhoto && (
        <div className="absolute inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setSelectedPhoto(null)}>
          <div className="relative max-w-4xl w-full p-4" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelectedPhoto(null)} className="absolute -top-12 right-4 text-white hover:text-brand-cyan transition-colors bg-white/10 p-2 rounded-full"><X size={24}/></button>
              <img src={selectedPhoto.url} className="w-full h-auto max-h-[75vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/20 animate-in zoom-in-95 duration-300" alt={`Site photo ${selectedPhoto.id}`} />
              <div className="mt-6 bg-slate-900 border border-white/10 p-4 rounded-xl flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-lg text-white">{selectedPhoto.notes || `Photo Record: ${selectedPhoto.id}`}</h4>
                    <div className="flex space-x-4 mt-2">
                      <p className="text-sm text-emerald-400 font-medium">Wall: <span className="text-white capitalize">{selectedPhoto.position.wall}</span></p>
                      <p className="text-sm text-brand-cyan font-medium">Coordinates: <span className="text-white">{selectedPhoto.position.x}%, {selectedPhoto.position.y}%</span></p>
                    </div>
                    {selectedPhoto.tags && selectedPhoto.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {selectedPhoto.tags.map((tag, i) => (
                           <span key={i} className="bg-white/10 text-white text-xs px-2 py-1 rounded-md">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkthroughViewer;

