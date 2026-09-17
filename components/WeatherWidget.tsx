import React, { useState, useEffect } from 'react';
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun, Wind } from 'lucide-react';

interface WeatherWidgetProps {
    address: string;
}

interface WeatherData {
    temperature: number;
    windspeed: number;
    weathercode: number;
}

export default function WeatherWidget({ address }: WeatherWidgetProps) {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchWeather = async () => {
            if (!address) {
                setLoading(false);
                return;
            }
            
            setLoading(true);
            setError(null);
            try {
                let lat: number | null = null;
                let lng: number | null = null;

                // Check if address is coordinates
                const coordsMatch = address.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
                if (coordsMatch) {
                    lat = parseFloat(coordsMatch[1]);
                    lng = parseFloat(coordsMatch[3]);
                } else {
                    // Try geocoding
                    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address)}&count=1&language=en&format=json`);
                    if (!geoRes.ok) throw new Error('Geocoding failed');
                    const geoData = await geoRes.json();
                    
                    if (geoData.results && geoData.results.length > 0) {
                        lat = geoData.results[0].latitude;
                        lng = geoData.results[0].longitude;
                    }
                }

                if (lat !== null && lng !== null) {
                    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph`);
                    if (!weatherRes.ok) throw new Error('Weather fetch failed');
                    const weatherData = await weatherRes.json();
                    
                    if (weatherData.current_weather) {
                        setWeather(weatherData.current_weather);
                    }
                } else {
                    setError('Location not found');
                }
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Failed to load weather');
            } finally {
                setLoading(false);
            }
        };

        fetchWeather();
    }, [address]);

    if (loading) {
        return <div className="p-3 bg-slate-900 rounded-xl border border-white/5 animate-pulse h-16 w-full"></div>;
    }

    if (error || !weather) {
        return null; // Silently fail or return small error state
    }

    // Map WMO weather codes to icons
    // https://open-meteo.com/en/docs
    const getWeatherIcon = (code: number) => {
        if (code === 0) return <Sun size={20} className="text-yellow-400" />;
        if (code === 1 || code === 2 || code === 3) return <Cloud size={20} className="text-slate-300" />;
        if (code === 45 || code === 48) return <CloudFog size={20} className="text-slate-400" />;
        if (code >= 51 && code <= 67) return <CloudRain size={20} className="text-blue-400" />;
        if (code >= 71 && code <= 77) return <CloudSnow size={20} className="text-slate-100" />;
        if (code >= 80 && code <= 82) return <CloudRain size={20} className="text-blue-400" />;
        if (code >= 85 && code <= 86) return <CloudSnow size={20} className="text-slate-100" />;
        if (code >= 95) return <CloudLightning size={20} className="text-yellow-500" />;
        return <Sun size={20} className="text-yellow-400" />;
    };

    const getWeatherDesc = (code: number) => {
        if (code === 0) return "Clear sky";
        if (code === 1 || code === 2 || code === 3) return "Partly cloudy";
        if (code === 45 || code === 48) return "Fog";
        if (code >= 51 && code <= 55) return "Drizzle";
        if (code >= 61 && code <= 67) return "Rain";
        if (code >= 71 && code <= 77) return "Snow";
        if (code >= 80 && code <= 82) return "Rain showers";
        if (code >= 85 && code <= 86) return "Snow showers";
        if (code >= 95) return "Thunderstorm";
        return "Unknown";
    };

    return (
        <div className="p-3 bg-slate-900/50 rounded-xl border border-white/5">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="p-2 bg-slate-800 rounded-lg">
                        {getWeatherIcon(weather.weathercode)}
                    </div>
                    <div>
                        <div className="text-sm font-bold text-white flex items-center">
                            {weather.temperature}&deg;F
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                            {getWeatherDesc(weather.weathercode)}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="text-[10px] text-slate-400 flex items-center space-x-1">
                        <Wind size={10} /> <span>{weather.windspeed} mph</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

