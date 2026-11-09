import React, { useState, useRef } from "react";
import {
  ArrowLeft,
  Check,
  Loader2,
  Mic,
  Sparkles,
  MapPin,
  Search,
  X,
  Send,
  Compass,
  Navigation,
  FileCheck,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { addProject } from "../services/api";
import { WaterCategory, LossClass, Project } from "../types";
import { Type } from "@google/genai";
import { AIRouterClient } from "../services/AIRouterClient";
import { EventBus } from "../services/EventBus";
import { APIProvider, Map as GoogleMap, AdvancedMarker } from "@vis.gl/react-google-maps";
import { generateDefaultProjectTemplates } from "../services/projectTemplateAutomation";

// Docs: https://developers.google.com/maps/documentation/geocoding/overview?utm_campaign=gmp_mcp_codeassist_v1_aistudio
const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  process.env.VITE_GOOGLE_MAPS_API_KEY ||
  "";
const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY";

interface ReverseGeocodeMetadata {
  formattedAddress: string;
  lat: number;
  lng: number;
  granularity: string;
  plusCode?: string;
  placeId?: string;
  source: string;
  allResults?: Array<{ formattedAddress: string; placeId: string; granularity: string }>;
}

const NewProject: React.FC = () => {
  const { setActiveTab, setSelectedProjectId, currentUser, isOnline } =
    useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [isScribing, setIsScribing] = useState(false);
  const [scribeText, setScribeText] = useState("");
  const [isListening, setIsListening] = useState(false);

  // Address & Coordinate State
  const [isLocating, setIsLocating] = useState(false);
  const [latInput, setLatInput] = useState<string>("");
  const [lngInput, setLngInput] = useState<string>("");
  const [resolvedGeoMeta, setResolvedGeoMeta] = useState<ReverseGeocodeMetadata | null>(null);
  const [geoErrorMsg, setGeoErrorMsg] = useState<string | null>(null);

  // Address Lookup Modal State
  const [showMapSearch, setShowMapSearch] = useState(false);
  const [mapQuery, setMapQuery] = useState("");
  const [isMapSearching, setIsMapSearching] = useState(false);

  // Dynamic Address Suggestions
  const [addressSuggestions, setAddressSuggestions] = useState<
    Array<{ display_name: string; cleanAddress: string; lat?: number; lng?: number; granularity?: string }>
  >([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [lossInfo, setLossInfo] = useState({
    location: "",
    lossDate: new Date().toISOString().slice(0, 16),
    clientName: "",
    claimNumber: "",
    insurance: "",
    waterCategory: WaterCategory.CAT_1,
    lossClass: LossClass.CLASS_1,
    jobType: "Water",
  });

  /**
   * Reverse-geocodes a pair of Latitude & Longitude coordinates into a physical street address
   * via the server-side Google Maps Platform Geocoding API endpoint (/api/maps/reverse-geocode).
   */
  const reverseGeocodeCoordinates = async (lat: number, lng: number) => {
    setGeoErrorMsg(null);
    setLatInput(lat.toFixed(6));
    setLngInput(lng.toFixed(6));

    if (!isOnline) {
      const coordFallback = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLossInfo((prev) => ({ ...prev, location: coordFallback }));
      setResolvedGeoMeta({
        formattedAddress: coordFallback,
        lat,
        lng,
        granularity: "OFFLINE_GPS",
        source: "Offline Coordinates",
      });
      return;
    }

    setIsLocating(true);
    try {
      const res = await fetch(
        `/api/maps/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
      );
      const data = await res.json().catch(() => ({}));

      // Tier 2 Quota Check
      if (
        res.status === 429 ||
        data?.quotaExceeded ||
        data?.error === "RESOURCE_EXHAUSTED" ||
        data?.error === "OVER_QUERY_LIMIT"
      ) {
        window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
        throw new Error("Google Maps Platform quota reached.");
      }

      if (!res.ok) {
        throw new Error(data?.error || `Reverse geocoding failed (${res.status})`);
      }

      const formattedAddress =
        data?.formattedAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      setLossInfo((prev) => ({ ...prev, location: formattedAddress }));
      setResolvedGeoMeta({
        formattedAddress,
        lat,
        lng,
        granularity: data?.granularity || "ROOFTOP",
        plusCode: data?.plusCode || "",
        placeId: data?.placeId || "",
        source: data?.source || "Google Maps Geocoding API",
        allResults: Array.isArray(data?.allResults) ? data.allResults : [],
      });

      EventBus.publish(
        "com.restorationai.location.reverse_geocoded",
        {
          latitude: lat,
          longitude: lng,
          address: formattedAddress,
          source: data?.source || "Google Maps Geocoding API",
        },
        undefined,
        `Converted (${lat.toFixed(4)}, ${lng.toFixed(4)}) → ${formattedAddress}`,
        "success"
      );
    } catch (error) {
      console.error("Reverse geocoding failed", error);
      const fallbackStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      setLossInfo((prev) => ({ ...prev, location: fallbackStr }));
      setGeoErrorMsg(
        error instanceof Error ? error.message : "Could not resolve street address from coordinates."
      );
    } finally {
      setIsLocating(false);
    }
  };

  /**
   * Converts manually entered Latitude and Longitude values (or "lat, lng" inside the location box)
   * into a formatted physical street address.
   */
  const handleConvertLatLngToAddress = async () => {
    setGeoErrorMsg(null);
    let parsedLat = parseFloat(latInput.trim());
    let parsedLng = parseFloat(lngInput.trim());

    // Also allow parsing "lat, lng" directly from the Risk Address field if latInput/lngInput are empty
    if ((isNaN(parsedLat) || isNaN(parsedLng)) && lossInfo.location.trim()) {
      const match = lossInfo.location
        .trim()
        .match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
      if (match) {
        parsedLat = parseFloat(match[1]);
        parsedLng = parseFloat(match[2]);
      }
    }

    if (
      isNaN(parsedLat) ||
      isNaN(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      setGeoErrorMsg(
        "Enter valid Latitude (-90 to 90) and Longitude (-180 to 180) coordinates to convert to a street address."
      );
      return;
    }

    await reverseGeocodeCoordinates(parsedLat, parsedLng);
  };

  const handleScribe = async () => {
    if (!isOnline) return;

    if (!scribeText.trim()) {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
          setIsListening(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setScribeText(transcript);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsListening(false);
        };

        recognition.start();
      } else {
        EventBus.publish(
          "com.restorationai.system.notice",
          {},
          undefined,
          "Speech recognition not supported in this browser.",
          "warning"
        );
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
      return;
    }

    setIsScribing(true);
    try {
      const router = new AIRouterClient();
      const response = await router.execute(
        "FAST_ANALYSIS",
        `Extract project details from this field note: "${scribeText}". 
                Identify: clientName, location, insurance, claimNumber, waterCategory (CAT_1, CAT_2, or CAT_3), and lossClass (CLASS_1, CLASS_2, CLASS_3, or CLASS_4).`,
        {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clientName: { type: Type.STRING },
              location: { type: Type.STRING },
              insurance: { type: Type.STRING },
              claimNumber: { type: Type.STRING },
              waterCategory: { type: Type.STRING },
              lossClass: { type: Type.STRING },
            },
          },
        }
      );
      const data = JSON.parse(response.text || "{}");
      setLossInfo((prev) => ({
        ...prev,
        clientName: data.clientName || prev.clientName,
        location: data.location || prev.location,
        insurance: data.insurance || prev.insurance,
        claimNumber: data.claimNumber || prev.claimNumber,
        waterCategory:
          (data.waterCategory as WaterCategory) || prev.waterCategory,
        lossClass: (data.lossClass as LossClass) || prev.lossClass,
      }));
      setScribeText("");
    } catch (err) {
      console.error("Scribe failed", err);
    } finally {
      setIsScribing(false);
    }
  };

  const handleLocationChange = (val: string) => {
    setLossInfo((prev) => ({ ...prev, location: val }));
    setGeoErrorMsg(null);

    // If user typed raw "lat, lng" into the location field, populate latInput and lngInput automatically
    const coordMatch = val.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      setLatInput(coordMatch[1]);
      setLngInput(coordMatch[2]);
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (val.trim().length < 4) {
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      return;
    }

    setShowAddressDropdown(true);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingAddress(true);
      try {
        // If user entered raw coordinates, reverse-geocode them immediately for the dropdown
        if (coordMatch) {
          const lat = parseFloat(coordMatch[1]);
          const lng = parseFloat(coordMatch[2]);
          const revRes = await fetch(
            `/api/maps/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
          );
          const revData = await revRes.json().catch(() => ({}));
          if (revRes.status === 429 || revData?.quotaExceeded) {
            window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
          } else if (revRes.ok && revData?.formattedAddress) {
            setAddressSuggestions([
              {
                display_name: `Coordinates (${lat.toFixed(5)}, ${lng.toFixed(5)}) • ${revData.source || "Google Maps"}`,
                cleanAddress: revData.formattedAddress,
                lat,
                lng,
                granularity: revData.granularity || "ROOFTOP",
              },
            ]);
          }
          setIsSearchingAddress(false);
          return;
        }

        const res = await fetch(
          `/api/maps/geocode?address=${encodeURIComponent(val.trim())}`
        );
        const data = await res.json().catch(() => ({}));

        if (
          res.status === 429 ||
          data?.quotaExceeded ||
          data?.error === "RESOURCE_EXHAUSTED" ||
          data?.error === "OVER_QUERY_LIMIT"
        ) {
          window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
          setAddressSuggestions([]);
          return;
        }

        if (res.ok && Array.isArray(data?.results)) {
          const mapped = data.results.map(
            (item: {
              formattedAddress: string;
              displayName?: string;
              lat?: number;
              lng?: number;
              granularity?: string;
            }) => ({
              display_name: item.displayName || item.formattedAddress,
              cleanAddress: item.formattedAddress,
              lat: item.lat,
              lng: item.lng,
              granularity: item.granularity,
            })
          );
          setAddressSuggestions(mapped);
        } else {
          setAddressSuggestions([]);
        }
      } catch (err) {
        console.error("Address autocomplete search failed", err);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500);
  };

  const selectAddressSuggestion = (sug: {
    cleanAddress: string;
    display_name: string;
    lat?: number;
    lng?: number;
    granularity?: string;
  }) => {
    setLossInfo((prev) => ({ ...prev, location: sug.cleanAddress }));
    if (sug.lat !== undefined && sug.lng !== undefined) {
      setLatInput(sug.lat.toFixed(6));
      setLngInput(sug.lng.toFixed(6));
      setResolvedGeoMeta({
        formattedAddress: sug.cleanAddress,
        lat: sug.lat,
        lng: sug.lng,
        granularity: sug.granularity || "ROOFTOP",
        source: "Google Maps Geocoding API",
      });
    }
    setAddressSuggestions([]);
    setShowAddressDropdown(false);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    setGeoErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        await reverseGeocodeCoordinates(latitude, longitude);
      },
      (error) => {
        console.error("Geolocation error", error);
        setIsLocating(false);
        setGeoErrorMsg(
          "Unable to retrieve device GPS automatically. Enter your Latitude & Longitude coordinates below to convert to a street address."
        );
      }
    );
  };

  const handleAddressLookup = async () => {
    if (!mapQuery.trim() || !isOnline) return;
    setIsMapSearching(true);
    try {
      const res = await fetch(
        `/api/maps/geocode?address=${encodeURIComponent(mapQuery.trim())}`
      );
      const data = await res.json().catch(() => ({}));

      if (res.status === 429 || data?.quotaExceeded) {
        window.dispatchEvent(new CustomEvent("gmp-quota-exceeded"));
        return;
      }

      if (res.ok && Array.isArray(data?.results) && data.results.length > 0) {
        const top = data.results[0];
        setLossInfo((prev) => ({ ...prev, location: top.formattedAddress }));
        if (top.lat !== undefined && top.lng !== undefined) {
          setLatInput(Number(top.lat).toFixed(6));
          setLngInput(Number(top.lng).toFixed(6));
          setResolvedGeoMeta({
            formattedAddress: top.formattedAddress,
            lat: Number(top.lat),
            lng: Number(top.lng),
            granularity: top.granularity || "ROOFTOP",
            source: data.source || "Google Maps Geocoding API",
          });
        }
        setShowMapSearch(false);
        setMapQuery("");
        EventBus.publish(
          "com.restorationai.location.geocoded",
          { query: mapQuery, topResult: top.formattedAddress },
          undefined,
          `Located "${top.formattedAddress}"`,
          "success"
        );
      } else {
        setGeoErrorMsg("Address not found. Try refining your search or entering coordinates.");
      }
    } catch (error) {
      console.error("Map lookup failed", error);
      setGeoErrorMsg("Map lookup failed. Please try again.");
    } finally {
      setIsMapSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentUser?.companyId || !lossInfo.clientName || !lossInfo.location) {
      setGeoErrorMsg("Please fill in required fields (Risk Address and Client Name).");
      return;
    }

    setIsSaving(true);
    try {
      // Automatically generate standard documentation templates pre-filled with client info
      const autoTemplates = generateDefaultProjectTemplates({
        client: lossInfo.clientName,
        address: lossInfo.location,
        lossDate: lossInfo.lossDate,
        insurance: lossInfo.insurance,
        claimNumber: lossInfo.claimNumber,
        waterCategory: lossInfo.waterCategory,
        lossClass: lossInfo.lossClass,
      });

      const newLoss = await addProject({
        companyId: currentUser.companyId,
        client: lossInfo.clientName,
        address: lossInfo.location,
        lossDate: lossInfo.lossDate,
        insurance: lossInfo.insurance,
        claimNumber: lossInfo.claimNumber,
        status: "New Intake",
        currentStage: "Intake",
        waterCategory: lossInfo.waterCategory,
        lossClass: lossInfo.lossClass,
        progress: 0,
        riskLevel: "medium",
        rooms: [],
        milestones: [],
        tasks: [],
        lineItems: [],
        totalCost: 0,
        invoiceStatus: "Draft",
        roomScans: [],
        videos: [],
        equipment: [],
        dailyNarratives: [],
        dryingMonitor: [],
        documentationTemplates: autoTemplates,
      } as Omit<Project, "id">);

      if (!newLoss) {
        alert(
          "Failed to add project. Please check if the server is running or try again.",
        );
        setIsSaving(false);
        return;
      }

      // Publish CloudEvent for project creation
      EventBus.publish(
        "com.restorationai.project.created",
        {
          projectId: newLoss.id,
          client: newLoss.client,
          category: newLoss.waterCategory,
        },
        newLoss.id,
        `Project file initialized for ${newLoss.client}`,
        "success",
      );

      // Publish CloudEvent for automated documentation templates generation
      EventBus.publish(
        "com.restorationai.documentation.templates_generated",
        {
          projectId: newLoss.id,
          client: newLoss.client,
          templatesCount: 3,
          templates: ['client_intake', 'scope_outline', 'damage_assessment'],
          autoGeneratedAt: autoTemplates.autoGeneratedAt,
        },
        newLoss.id,
        `Auto-generated Intake Form, Scope Outline & Damage Assessment for ${newLoss.client}`,
        "success"
      );

      setSelectedProjectId(newLoss.id);
      setActiveTab("loss-detail");
    } catch (error) {
      console.error("Failed to add project", error);
      alert("Failed to add project. Ensure the server is running.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="flex flex-col h-full bg-slate-950 text-slate-200">
      <header className="bg-slate-900 border-b border-white/10 py-4 px-4 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setActiveTab("losses")}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-black tracking-tight text-white">
            Loss Intake
          </h1>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="bg-brand-cyan text-slate-950 px-6 py-2 rounded-full text-sm font-black flex items-center space-x-2 disabled:opacity-70 transition-all active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)]"
        >
          {isSaving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Check size={16} />
          )}
          <span>Start Job</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 pb-20">
        {/* AI Scribe Section */}
        <div className="bg-gradient-to-br from-indigo-600/20 to-blue-600/10 p-6 rounded-[2.5rem] border border-indigo-500/20 shadow-xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-indigo-500/5 blur-2xl group-hover:bg-indigo-500/10 transition-all duration-700" />
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                <Sparkles size={20} />
              </div>
              <h3 className="font-black text-white text-sm uppercase tracking-widest">
                Intelligent Scribe
              </h3>
            </div>
            <div className="relative">
              <textarea
                value={scribeText}
                onChange={(e) => setScribeText(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500/30 outline-none min-h-[100px] placeholder-slate-600 text-white"
                placeholder="Example: 'At Sarah Johnson's house 124 Maple, State Farm claim 9876, standing water in basement...'"
              />
              <button
                onClick={handleScribe}
                disabled={isScribing}
                className={`absolute bottom-4 right-4 p-3 text-white rounded-xl shadow-lg transition-all active:scale-90 ${isListening ? "bg-red-600 animate-pulse" : "bg-indigo-600 hover:bg-indigo-500"} disabled:opacity-50`}
              >
                {isScribing ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : scribeText.trim() ? (
                  <Send size={18} />
                ) : (
                  <Mic size={18} />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3 font-bold uppercase text-center tracking-tighter">
              AI will automatically populate the fields below
            </p>
          </div>
        </div>

        {/* Form Information */}
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 delay-100">
          <div className="flex items-center space-x-2 px-1">
            <div className="w-1 h-4 bg-brand-cyan rounded-full" />
            <h3 className="text-white font-bold text-lg">Essential Record</h3>
          </div>
          <div className="grid gap-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6 space-y-6 shadow-inner">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest">
                    Risk Address*
                  </label>
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLocating}
                    className="text-[11px] font-bold text-brand-cyan hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    {isLocating ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Navigation size={12} />
                    )}
                    <span>Use Device GPS</span>
                  </button>
                </div>
                <div className="relative group">
                  <input
                    value={lossInfo.location}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    onFocus={() => {
                      if (addressSuggestions.length > 0)
                        setShowAddressDropdown(true);
                    }}
                    className="w-full bg-slate-900/50 text-lg font-bold text-white border border-white/10 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all"
                    placeholder="123 Example St or 47.6062, -122.3321"
                  />
                  <button
                    type="button"
                    onClick={handleUseMyLocation}
                    disabled={isLocating}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-brand-cyan hover:bg-white/5 rounded-lg transition-colors active:scale-90"
                    title="Use My Location"
                  >
                    {isLocating ? (
                      <Loader2
                        size={20}
                        className="animate-spin text-brand-cyan"
                      />
                    ) : (
                      <MapPin size={20} />
                    )}
                  </button>

                  {showAddressDropdown &&
                    (addressSuggestions.length > 0 || isSearchingAddress) && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-xl overflow-hidden z-20 shadow-2xl animate-in fade-in duration-200">
                        {isSearchingAddress && (
                          <div className="p-3 text-xs text-brand-cyan flex items-center space-x-2 border-b border-white/5 bg-slate-900/40">
                            <Loader2
                              size={12}
                              className="animate-spin text-brand-cyan"
                            />
                            <span>Locating exact addresses...</span>
                          </div>
                        )}
                        <div className="max-h-60 overflow-y-auto no-scrollbar">
                          {addressSuggestions.map((sug, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => selectAddressSuggestion(sug)}
                              className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/10 last:border-0 transition-colors"
                            >
                              <span className="block text-xs font-bold text-white leading-tight">
                                {sug.cleanAddress}
                              </span>
                              <span className="block text-[10px] text-slate-500 mt-1 truncate">
                                {sug.display_name}
                              </span>
                            </button>
                          ))}
                          {!isSearchingAddress &&
                            addressSuggestions.length === 0 && (
                              <div className="p-3 text-xs text-slate-500">
                                No matching addresses found. Keep typing.
                              </div>
                            )}
                        </div>
                      </div>
                    )}
                </div>

                {/* Latitude & Longitude Coordinate-to-Address Converter & Map Legend */}
                <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Compass size={15} className="text-brand-cyan" />
                      <span className="text-[11px] font-black uppercase tracking-wider text-white">
                        Latitude &amp; Longitude → Street Address Converter
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Google Maps Reverse Geocoding
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Latitude (N/S)
                      </label>
                      <input
                        type="text"
                        value={latInput}
                        onChange={(e) => setLatInput(e.target.value)}
                        placeholder="e.g. 47.606209"
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-brand-cyan outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Longitude (E/W)
                      </label>
                      <input
                        type="text"
                        value={lngInput}
                        onChange={(e) => setLngInput(e.target.value)}
                        placeholder="e.g. -122.332069"
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:border-brand-cyan outline-none"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleConvertLatLngToAddress}
                        disabled={isLocating}
                        className="w-full py-2 px-3 rounded-xl bg-brand-cyan/20 hover:bg-brand-cyan/30 border border-brand-cyan/40 text-brand-cyan text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                      >
                        {isLocating ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <MapPin size={14} />
                        )}
                        <span>Make Address</span>
                      </button>
                    </div>
                  </div>

                  {geoErrorMsg && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium">
                      {geoErrorMsg}
                    </div>
                  )}

                  {/* Location Legend & Resolved Coordinate Telemetry */}
                  <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                    <div className="flex flex-wrap items-center gap-3 text-slate-400">
                      <span className="font-bold uppercase tracking-wider text-slate-500">
                        Location Legend:
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        ROOFTOP Street Match
                      </span>
                      <span className="flex items-center gap-1 text-brand-cyan font-bold">
                        <span className="w-2 h-2 rounded-full bg-brand-cyan" />
                        GPS Lat/Lng Pin
                      </span>
                      <span className="flex items-center gap-1 text-amber-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        Approximate Parcel
                      </span>
                    </div>
                    {resolvedGeoMeta && (
                      <span className="font-mono text-slate-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                        {resolvedGeoMeta.lat.toFixed(5)}°, {resolvedGeoMeta.lng.toFixed(5)}° ·{" "}
                        <strong className="text-emerald-400">{resolvedGeoMeta.granularity}</strong>
                        {resolvedGeoMeta.plusCode ? ` · ${resolvedGeoMeta.plusCode}` : ""}
                      </span>
                    )}
                  </div>

                  {/* Interactive Map Preview when valid key & coordinates are set */}
                  {hasValidKey && resolvedGeoMeta && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-white/10 h-44 w-full relative">
                      <GoogleMap
                        style={{ width: "100%", height: "100%" }}
                        center={{ lat: resolvedGeoMeta.lat, lng: resolvedGeoMeta.lng }}
                        zoom={16}
                        mapId="DEMO_MAP_ID"
                        internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
                        gestureHandling="greedy"
                        disableDefaultUI={true}
                        onClick={(ev) => {
                          const clickedLat = ev.detail.latLng?.lat;
                          const clickedLng = ev.detail.latLng?.lng;
                          if (typeof clickedLat === "number" && typeof clickedLng === "number") {
                            reverseGeocodeCoordinates(clickedLat, clickedLng);
                          }
                        }}
                      >
                        <AdvancedMarker
                          position={{ lat: resolvedGeoMeta.lat, lng: resolvedGeoMeta.lng }}
                          title={resolvedGeoMeta.formattedAddress}
                        />
                      </GoogleMap>
                      <div className="absolute bottom-2 left-2 right-2 bg-slate-950/85 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[10px] pointer-events-none">
                        <span className="text-white font-bold truncate">
                          {resolvedGeoMeta.formattedAddress}
                        </span>
                        <span className="text-brand-cyan font-mono shrink-0 ml-2">
                          Tap map to relocate pin
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Client Name*
                  </label>
                  <input
                    value={lossInfo.clientName}
                    onChange={(e) =>
                      setLossInfo({ ...lossInfo, clientName: e.target.value })
                    }
                    className="w-full bg-slate-900/50 text-sm font-bold text-white border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all"
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Loss Date*
                  </label>
                  <input
                    type="datetime-local"
                    value={lossInfo.lossDate}
                    onChange={(e) =>
                      setLossInfo({ ...lossInfo, lossDate: e.target.value })
                    }
                    className="w-full bg-slate-900/50 text-sm font-bold text-white border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Insurance
                  </label>
                  <input
                    value={lossInfo.insurance}
                    onChange={(e) =>
                      setLossInfo({ ...lossInfo, insurance: e.target.value })
                    }
                    className="w-full bg-slate-900/50 text-sm font-bold text-white border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all"
                    placeholder="Carrier"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Claim #
                  </label>
                  <input
                    value={lossInfo.claimNumber}
                    onChange={(e) =>
                      setLossInfo({ ...lossInfo, claimNumber: e.target.value })
                    }
                    className="w-full bg-slate-900/50 text-sm font-bold text-white border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Water Category*
                  </label>
                  <select
                    value={lossInfo.waterCategory}
                    onChange={(e) =>
                      setLossInfo({
                        ...lossInfo,
                        waterCategory: e.target.value as WaterCategory,
                      })
                    }
                    className="w-full bg-slate-900/50 text-sm font-bold text-white border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all outline-none appearance-none"
                  >
                    {Object.values(WaterCategory).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Loss Class*
                  </label>
                  <select
                    value={lossInfo.lossClass}
                    onChange={(e) =>
                      setLossInfo({
                        ...lossInfo,
                        lossClass: e.target.value as LossClass,
                      })
                    }
                    className="w-full bg-slate-900/50 text-sm font-bold text-white border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all outline-none appearance-none"
                  >
                    {Object.values(LossClass).map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Automated Project Setup Banner */}
              <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-brand-cyan/10 via-brand-cyan/5 to-transparent border border-brand-cyan/20">
                <div className="flex items-center space-x-2 text-brand-cyan font-bold text-xs uppercase tracking-wider mb-2">
                  <SparklesIcon size={14} />
                  <span>Automated Initial Setup Protocol Active</span>
                </div>
                <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                  Upon initiating this project, Restoration AI will automatically generate and pre-fill a standard mitigation documentation suite:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="bg-slate-900/80 border border-white/5 rounded-xl p-2.5 flex items-start space-x-2">
                    <FileCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-white">Client Intake Form</div>
                      <div className="text-[10px] text-slate-400">Pre-filled client, property & insurance data</div>
                    </div>
                  </div>
                  <div className="bg-slate-900/80 border border-white/5 rounded-xl p-2.5 flex items-start space-x-2">
                    <FileCheck size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-white">Scope Outline</div>
                      <div className="text-[10px] text-slate-400">IICRC S500 formulas & equipment targets</div>
                    </div>
                  </div>
                  <div className="bg-slate-900/80 border border-white/5 rounded-xl p-2.5 flex items-start space-x-2">
                    <FileCheck size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-white">Damage Assessment</div>
                      <div className="text-[10px] text-slate-400">Initial multi-point hazard checklist</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map Search Modal (Kept as backup if needed, but primary is GPS) */}
      {showMapSearch && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl space-y-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-cyan/10 blur-[50px] rounded-full pointer-events-none" />

            <div className="flex justify-between items-center relative z-10">
              <h3 className="text-white font-black text-lg flex items-center gap-2">
                <Search size={22} className="text-brand-cyan" /> Address Search
              </h3>
              <button
                onClick={() => setShowMapSearch(false)}
                className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              Search for a business name, landmark, or partial address. Gemini
              will locate the exact postal address.
            </p>

            <div className="relative">
              <input
                autoFocus
                value={mapQuery}
                onChange={(e) => setMapQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddressLookup()}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-4 pr-12 text-white text-sm font-bold focus:border-brand-cyan/50 focus:ring-1 focus:ring-brand-cyan/50 focus:outline-none transition-all placeholder-slate-600"
                placeholder="e.g. 'Home Depot downtown Seattle'"
              />
              <button
                onClick={handleAddressLookup}
                disabled={isMapSearching || !mapQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-brand-cyan text-slate-900 rounded-lg disabled:opacity-50 transition-all hover:bg-cyan-400 active:scale-95"
              >
                {isMapSearching ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Search size={18} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </APIProvider>
  );
};

export default NewProject;
