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
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { addProject } from "../services/api";
import { WaterCategory, LossClass, Project } from "../types";
import { Type } from "@google/genai";
import { AIRouterClient } from "../services/AIRouterClient";
import { EventBus } from "../services/EventBus";
import { APIProvider } from "@vis.gl/react-google-maps";

interface GoogleMapsWindow {
  google?: {
    maps?: {
      Geocoder: any;
    };
  };
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || "";
const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

const NewProject: React.FC = () => {
  const { setActiveTab, setSelectedProjectId, currentUser, isOnline } =
    useAppContext();
  const [isSaving, setIsSaving] = useState(false);
  const [isScribing, setIsScribing] = useState(false);
  const [scribeText, setScribeText] = useState("");
  const [isListening, setIsListening] = useState(false);

  // Address State
  const [isLocating, setIsLocating] = useState(false);

  // Address Lookup State (Kept for fallback if needed, but primary GPS button now uses Geolocation)
  const [showMapSearch, setShowMapSearch] = useState(false);
  const [mapQuery, setMapQuery] = useState("");
  const [isMapSearching, setIsMapSearching] = useState(false);

  // Dynamic Address Suggestions
  const [addressSuggestions, setAddressSuggestions] = useState<
    Array<{ display_name: string; cleanAddress: string }>
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
        alert("Speech recognition not supported in this browser.");
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
        },
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
        const gWindow = window as unknown as GoogleMapsWindow;
        if (hasValidKey && typeof window !== "undefined" && gWindow.google?.maps) {
          const geocoder = new gWindow.google.maps.Geocoder();
          geocoder.geocode({ address: val }, (results, status) => {
            if (status === "OK" && results && results.length > 0) {
              const mapped = results.map((item: any) => ({
                display_name: item.formatted_address,
                cleanAddress: item.formatted_address,
              }));
              setAddressSuggestions(mapped);
              EventBus.publish(
                "com.restorationai.location.geocoded",
                {
                  query: val,
                  topResult: results[0].formatted_address,
                  resultsCount: results.length,
                },
                undefined,
                `Geocoded "${val}" via Google Maps`,
                "info"
              );
            } else {
              setAddressSuggestions([]);
            }
            setIsSearchingAddress(false);
          });
          return;
        }

        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&addressdetails=1`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent": "RestorationAI/1.0 (merrillalex500@gmail.com)",
            },
          },
        );
        if (response.ok) {
          const results = await response.json();
          if (Array.isArray(results)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped = results.map((item: any) => {
              const addr = item.address;
              let clean = "";
              if (addr) {
                const house = addr.house_number || "";
                const road = addr.road || "";
                const city =
                  addr.city || addr.town || addr.village || addr.suburb || "";
                const state = addr.state || "";
                const postcode = addr.postcode || "";
                const streetPart = [house, road].filter(Boolean).join(" ");
                const cityStatePart = [city, state].filter(Boolean).join(", ");
                clean = [streetPart, cityStatePart, postcode]
                  .filter(Boolean)
                  .join(" ");
              }
              if (!clean) {
                clean = item.display_name;
              }
              return {
                display_name: item.display_name,
                cleanAddress: clean,
              };
            });
            setAddressSuggestions(mapped);
          }
        }
      } catch (err) {
        console.error("Address autocomplete search failed", err);
      } finally {
        const gWindowCheck = window as unknown as GoogleMapsWindow;
        if (!hasValidKey || typeof window === "undefined" || !gWindowCheck.google?.maps) {
          setIsSearchingAddress(false);
        }
      }
    }, 600);
  };

  const selectAddressSuggestion = (cleanAddress: string) => {
    setLossInfo((prev) => ({ ...prev, location: cleanAddress }));
    setAddressSuggestions([]);
    setShowAddressDropdown(false);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        if (!isOnline) {
          // Offline fallback: just set coordinates
          setLossInfo((prev) => ({
            ...prev,
            location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          }));
          setIsLocating(false);
          return;
        }

        const gWindow = window as unknown as GoogleMapsWindow;
        if (hasValidKey && typeof window !== "undefined" && gWindow.google?.maps?.Geocoder) {
          const geocoder = new gWindow.google.maps.Geocoder();
          geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: any) => {
            if (status === "OK" && results && results[0]) {
              const cleanAddress = results[0].formatted_address;
              setLossInfo((prev) => ({ ...prev, location: cleanAddress }));
              EventBus.publish(
                "com.restorationai.location.reverse_geocoded",
                {
                  latitude,
                  longitude,
                  address: cleanAddress,
                  resultsCount: results.length,
                },
                undefined,
                `Reverse-geocoded coordinates via Google Maps`,
                "success"
              );
            } else {
              setLossInfo((prev) => ({
                ...prev,
                location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              }));
            }
            setIsLocating(false);
          });
          return;
        }

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            {
              headers: {
                Accept: "application/json",
                "User-Agent": "RestorationAI/1.0 (merrillalex500@gmail.com)",
              },
            },
          );
          if (!response.ok)
            throw new Error("Failed to fetch from OSM Nominatim");

          const data = await response.json();

          if (data && data.display_name) {
            const addr = data.address;
            let cleanAddress = "";
            if (addr) {
              const streetNo = addr.house_number || "";
              const road = addr.road || "";
              const city =
                addr.city || addr.town || addr.village || addr.suburb || "";
              const state = addr.state || "";
              const postcode = addr.postcode || "";

              const streetPart = [streetNo, road].filter(Boolean).join(" ");
              const cityStatePart = [city, state].filter(Boolean).join(", ");

              cleanAddress = [streetPart, cityStatePart, postcode]
                .filter(Boolean)
                .join(" ");
            }

            if (!cleanAddress) {
              cleanAddress = data.display_name;
            }

            setLossInfo((prev) => ({ ...prev, location: cleanAddress }));
          } else {
            setLossInfo((prev) => ({
              ...prev,
              location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            }));
          }
        } catch (error) {
          console.error("Reverse geocoding failed", error);
          try {
            const fallbackResponse = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            );
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json();
              if (fallbackData && fallbackData.locality) {
                setLossInfo((prev) => ({
                  ...prev,
                  location: `${fallbackData.locality}, ${fallbackData.principalSubdivision || ""}`,
                }));
                return;
              }
            }
          } catch (fallbackErr) {
            console.error(
              "Fallback reverse geocoding also failed",
              fallbackErr,
            );
          }
          setLossInfo((prev) => ({
            ...prev,
            location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          }));
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error("Geolocation error", error);
        setIsLocating(false);
        alert("Unable to retrieve location. Check permissions.");
      },
    );
  };

  const handleAddressLookup = async () => {
    if (!mapQuery.trim() || !isOnline) return;
    setIsMapSearching(true);
    try {
      const gWindow = window as unknown as GoogleMapsWindow;
      if (hasValidKey && typeof window !== "undefined" && gWindow.google?.maps) {
        const geocoder = new gWindow.google.maps.Geocoder();
        geocoder.geocode({ address: mapQuery }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            const cleanAddress = results[0].formatted_address;
            setLossInfo((prev) => ({ ...prev, location: cleanAddress }));
            setShowMapSearch(false);
            setMapQuery("");
            EventBus.publish(
              "com.restorationai.location.geocoded",
              {
                query: mapQuery,
                topResult: cleanAddress,
                resultsCount: results.length,
              },
              undefined,
              `Geocoded "${mapQuery}" via Google Maps`,
              "success"
            );
          } else {
            alert("Address not found.");
          }
          setIsMapSearching(false);
        });
        return;
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(mapQuery)}&format=json&limit=5&addressdetails=1`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "RestorationAI/1.0 (merrillalex500@gmail.com)",
          },
        },
      );
      if (!response.ok) throw new Error("Failed to fetch from Nominatim");

      const data = await response.json();

      if (data && data.length > 0) {
        const resNode = data[0];
        const addr = resNode.address;
        let cleanAddress = "";
        if (addr) {
          const house = addr.house_number || "";
          const road = addr.road || "";
          const city =
            addr.city || addr.town || addr.village || addr.suburb || "";
          const state = addr.state || "";
          const postcode = addr.postcode || "";

          const streetPart = [house, road].filter(Boolean).join(" ");
          const cityStatePart = [city, state].filter(Boolean).join(", ");
          cleanAddress = [streetPart, cityStatePart, postcode]
            .filter(Boolean)
            .join(" ");
        }

        if (!cleanAddress) {
          cleanAddress = resNode.display_name;
        }

        setLossInfo((prev) => ({ ...prev, location: cleanAddress }));
        setShowMapSearch(false);
        setMapQuery("");
      } else {
        alert("Address not found.");
      }
    } catch (error) {
      console.error("Map lookup failed", error);
      alert("Map lookup failed. Please try again.");
    } finally {
      const gWindowCheck = window as unknown as GoogleMapsWindow;
      if (!hasValidKey || typeof window === "undefined" || !gWindowCheck.google?.maps) {
        setIsMapSearching(false);
      }
    }
  };

  const handleSubmit = async () => {
    if (!currentUser?.companyId || !lossInfo.clientName || !lossInfo.location) {
      alert("Please fill in required fields (Location, Client Name).");
      return;
    }

    setIsSaving(true);
    try {
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
      } as Omit<Project, "id">);

      if (!newLoss) {
        alert(
          "Failed to add project. Please check if the server is running or try again.",
        );
        setIsSaving(false);
        return;
      }

      // Publish CloudEvent
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
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest">
                  Risk Address*
                </label>
                <div className="relative group">
                  <input
                    value={lossInfo.location}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    onFocus={() => {
                      if (addressSuggestions.length > 0)
                        setShowAddressDropdown(true);
                    }}
                    className="w-full bg-slate-900/50 text-lg font-bold text-white border border-white/10 rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-brand-cyan focus:ring-1 focus:ring-brand-cyan transition-all"
                    placeholder="123 Example St"
                  />
                  <button
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
                              onClick={() =>
                                selectAddressSuggestion(sug.cleanAddress)
                              }
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
