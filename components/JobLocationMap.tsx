import React, { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { MapPin, Navigation, ExternalLink, Layers, ZoomIn, ZoomOut, CheckCircle2 } from 'lucide-react';

interface JobLocationMapProps {
  address: string;
  clientName?: string;
  className?: string;
}

interface GeocoderLocation {
  lat: number | (() => number);
  lng: number | (() => number);
}

interface GeocoderGeometry {
  location: GeocoderLocation;
}

interface GeocoderResultItem {
  geometry: GeocoderGeometry;
  formatted_address: string;
}

interface GoogleMapsWindow {
  google?: {
    maps?: {
      Geocoder: new () => {
        geocode: (
          request: { address: string },
          callback: (results: GeocoderResultItem[] | null, status: string) => void
        ) => void;
      };
    };
  };
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || "";
const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

export const JobLocationMap: React.FC<JobLocationMapProps> = ({
  address,
  clientName,
  className = ''
}) => {
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid'>('roadmap');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [zoom, setZoom] = useState(16);

  useEffect(() => {
    if (!address || !hasValidKey) return;

    let isMounted = true;

    // Geocode address when Google Maps API is loaded
    const tryGeocode = () => {
      const gWindow = window as unknown as GoogleMapsWindow;
      if (gWindow.google?.maps?.Geocoder) {
        if (isMounted) setIsGeocoding(true);
        const geocoder = new gWindow.google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
          if (!isMounted) return;
          setIsGeocoding(false);
          if (status === 'OK' && results && results[0]?.geometry?.location) {
            const loc = results[0].geometry.location;
            setCoordinates({
              lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
              lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng,
            });
          } else {
            // Default fallback if address cannot be resolved: Los Angeles Metro
            setCoordinates({ lat: 34.0522, lng: -118.2437 });
          }
        });
      } else {
        // Retry shortly if script is still loading
        setTimeout(tryGeocode, 400);
      }
    };

    tryGeocode();

    return () => {
      isMounted = false;
    };
  }, [address]);

  // Fallback coords if not yet geocoded
  const center = coordinates || { lat: 34.0522, lng: -118.2437 };

  const googleMapsUrl = coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || 'Restoration Site')}`;

  if (!hasValidKey) {
    return (
      <div className={`bg-slate-900 border border-white/5 rounded-2xl p-5 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <MapPin size={16} className="text-brand-cyan" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Job Location</h3>
          </div>
        </div>
        <p className="text-xs text-slate-400">{address || 'No address provided'}</p>
        <div className="mt-3 p-3 bg-slate-950/60 rounded-xl border border-white/5 text-[11px] text-slate-500">
          Configure Google Maps Platform key to enable interactive maps.
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900 border border-white/5 rounded-2xl overflow-hidden shadow-xl ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-cyan animate-pulse" />
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Google Maps — Job Site</span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate max-w-[280px] sm:max-w-md">
              {address || 'Location pending'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Map Layer Switcher */}
          <button
            onClick={() => setMapType(prev => prev === 'roadmap' ? 'satellite' : 'roadmap')}
            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors border border-white/5 flex items-center gap-1"
            title="Toggle Map Style"
          >
            <Layers size={12} className="text-brand-cyan" />
            <span>{mapType === 'roadmap' ? 'Satellite' : 'Roadmap'}</span>
          </button>

          {/* External Directions Link */}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-brand-cyan/10 hover:bg-brand-cyan/20 text-brand-cyan rounded-lg transition-colors border border-brand-cyan/20 flex items-center gap-1"
            title="Open in Google Maps for turn-by-turn navigation"
          >
            <Navigation size={12} />
            <span className="hidden sm:inline">Directions</span>
            <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Map Container */}
      <div className="relative h-64 sm:h-72 w-full bg-slate-950">
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
          <Map
            center={center}
            zoom={zoom}
            mapId="DEMO_MAP_ID"
            mapTypeId={mapType}
            disableDefaultUI={false}
            zoomControl={false}
            streetViewControl={false}
            mapTypeControl={false}
            style={{ width: '100%', height: '100%' }}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          >
            {coordinates && (
              <AdvancedMarker position={coordinates} title={clientName || address}>
                <Pin
                  background={'#00d4aa'}
                  borderColor={'#007965'}
                  glyphColor={'#0b0d14'}
                  scale={1.15}
                />
              </AdvancedMarker>
            )}
          </Map>
        </APIProvider>

        {/* Quick Zoom Controls */}
        <div className="absolute right-3 bottom-3 flex flex-col gap-1 z-10">
          <button
            onClick={() => setZoom(z => Math.min(z + 1, 20))}
            className="w-7 h-7 bg-slate-900/90 hover:bg-slate-800 text-white rounded-lg border border-white/10 flex items-center justify-center transition-colors shadow-lg active:scale-95"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(z - 1, 3))}
            className="w-7 h-7 bg-slate-900/90 hover:bg-slate-800 text-white rounded-lg border border-white/10 flex items-center justify-center transition-colors shadow-lg active:scale-95"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
        </div>

        {/* Loading Indicator */}
        {isGeocoding && (
          <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] text-brand-cyan font-bold flex items-center gap-1.5 shadow-lg">
            <div className="w-2 h-2 rounded-full bg-brand-cyan animate-ping" />
            <span>Resolving coordinates...</span>
          </div>
        )}

        {/* Coordinates Pill */}
        {coordinates && (
          <div className="absolute left-3 bottom-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[9px] text-slate-400 font-mono flex items-center gap-1.5 shadow-lg">
            <CheckCircle2 size={10} className="text-emerald-400" />
            <span>{coordinates.lat.toFixed(4)}°N, {Math.abs(coordinates.lng).toFixed(4)}°W</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobLocationMap;
