import { ReferenceReading, ReferenceReadingZone } from '../types';
import { calculatePsychrometricsFromDryBulb } from './psychrometrics';

export interface WeatherFetchResult {
  temp: number;
  rh: number;
  source: string;
  weatherCode?: number;
}

/**
 * Fetches outdoor weather from Open-Meteo for an address or GPS coordinate string.
 * Reuses the application's weather integration source.
 */
export async function fetchOutdoorWeather(address?: string): Promise<WeatherFetchResult> {
  if (!address || !address.trim()) {
    throw new Error('Project address is required to fetch outdoor weather');
  }

  let lat: number | null = null;
  let lng: number | null = null;

  // 1. Check if address is comma-separated coordinates: "lat, lng"
  const coordsMatch = address.trim().match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
  if (coordsMatch) {
    lat = parseFloat(coordsMatch[1]);
    lng = parseFloat(coordsMatch[3]);
  } else {
    // 2. Geocode address via Open-Meteo Geocoding API
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(address.trim())}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) {
      throw new Error(`Geocoding failed with status ${geoRes.status}`);
    }
    const geoData = await geoRes.json();
    if (geoData.results && geoData.results.length > 0) {
      lat = geoData.results[0].latitude;
      lng = geoData.results[0].longitude;
    }
  }

  if (lat === null || lng === null) {
    throw new Error(`Unable to resolve geographic coordinates for "${address}"`);
  }

  // 3. Fetch current weather and humidity from Open-Meteo
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code&temperature_unit=fahrenheit&windspeed_unit=mph`;
  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) {
    throw new Error(`Weather fetch failed with status ${weatherRes.status}`);
  }

  const weatherData = await weatherRes.json();

  if (weatherData.current) {
    return {
      temp: Math.round(weatherData.current.temperature_2m * 10) / 10,
      rh: Math.round(weatherData.current.relative_humidity_2m),
      weatherCode: weatherData.current.weather_code,
      source: `Open-Meteo API (${lat.toFixed(2)}, ${lng.toFixed(2)})`
    };
  }

  // Fallback check for current_weather payload
  if (weatherData.current_weather) {
    return {
      temp: Math.round(weatherData.current_weather.temperature * 10) / 10,
      rh: 50, // default if relative humidity was not bundled
      weatherCode: weatherData.current_weather.weathercode,
      source: `Open-Meteo API (${lat.toFixed(2)}, ${lng.toFixed(2)})`
    };
  }

  throw new Error('Weather response missing current atmospheric data');
}

/**
 * Creates a validated ReferenceReading with computed GPP and dew point via utils/psychrometrics.ts.
 */
export function createReferenceReading(
  zone: ReferenceReadingZone,
  tempF: number,
  rh: number,
  options?: {
    photoId?: string;
    notes?: string;
    timestamp?: number;
    id?: string;
  }
): ReferenceReading {
  const psych = calculatePsychrometricsFromDryBulb(tempF, rh);
  return {
    id: options?.id || `ref-${zone}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    zone,
    temp: Math.round(tempF * 10) / 10,
    rh: Math.round(rh * 10) / 10,
    timestamp: options?.timestamp || Date.now(),
    photoId: options?.photoId,
    notes: options?.notes,
    gpp: psych.gpp,
    dewPoint: psych.dewPoint
  };
}

export interface GppDropAlertResult {
  level: 'normal' | 'caution' | 'warning' | 'alert';
  severity?: 'normal' | 'caution' | 'warning' | 'alert';
  isAlert?: boolean;
  title: string;
  message: string;
  affectedGpp?: number;
  outsideGpp?: number;
  unaffectedGpp?: number;
  hvacDropGpp?: number;
  hvacGrainDepression?: number;
  recommendation: string;
}

/**
 * Evaluates IICRC S500 psychrometric grain depression and chamber GPP drops.
 */
export function evaluateGppDropAlert(
  affectedGpp: number | undefined,
  referenceReadings: ReferenceReading[] = []
): GppDropAlertResult | null {
  if (affectedGpp === undefined || isNaN(affectedGpp) || affectedGpp <= 0) {
    return null;
  }

  // Find latest readings for each reference zone
  const getLatest = (zone: ReferenceReadingZone) => {
    const list = referenceReadings.filter(r => r.zone === zone);
    if (!list.length) return undefined;
    return list.slice().sort((a, b) => b.timestamp - a.timestamp)[0];
  };

  const outside = getLatest('outside');
  const unaffected = getLatest('unaffected');
  const affHvac = getLatest('affected-hvac');
  const unaffHvac = getLatest('unaffected-hvac');

  // Check HVAC drop if both affected chamber and affected-hvac readings exist
  let hvacDrop: number | undefined;
  if (affHvac) {
    hvacDrop = Math.round((affectedGpp - affHvac.gpp) * 10) / 10;
  }

  // If outside reading is available
  if (outside) {
    const outsideDiff = Math.round((affectedGpp - outside.gpp) * 10) / 10;

    // Outdoor is significantly drier than affected chamber
    if (outside.gpp < affectedGpp - 15) {
      return {
        level: 'normal',
        severity: 'normal',
        isAlert: false,
        title: 'Open / Combination Drying Window Available',
        message: `Chamber GPP (${affectedGpp}) is ${outsideDiff} grains above outside GPP (${outside.gpp}). Outside air is significantly drier.`,
        affectedGpp,
        outsideGpp: outside.gpp,
        unaffectedGpp: unaffected?.gpp,
        hvacDropGpp: hvacDrop,
        hvacGrainDepression: hvacDrop,
        recommendation: 'Per IICRC S500, controlled air exchange or ventilation can expedite initial moisture evacuation if outdoor conditions remain dry.'
      };
    }

    // Outdoor is wetter than chamber
    if (outside.gpp > affectedGpp + 10) {
      return {
        level: 'warning',
        severity: 'warning',
        isAlert: true,
        title: 'High Outdoor Humidity — Maintain Closed System',
        message: `Outdoor GPP (${outside.gpp}) is higher than drying chamber GPP (${affectedGpp}) by ${Math.abs(outsideDiff)} grains. High moisture differential requires closed chamber.`,
        affectedGpp,
        outsideGpp: outside.gpp,
        unaffectedGpp: unaffected?.gpp,
        hvacDropGpp: hvacDrop,
        hvacGrainDepression: hvacDrop,
        recommendation: 'Ensure all windows, doors, and exterior dampers are fully sealed. Rely entirely on closed mechanical dehumidification.'
      };
    }
  }

  // Check HVAC / Dehumidifier drop
  if (hvacDrop !== undefined) {
    if (hvacDrop < 8) {
      return {
        level: 'alert',
        severity: 'alert',
        isAlert: true,
        title: 'Low Grain Depression / HVAC Alert',
        message: `Affected HVAC / Dehumidifier exhaust drop is only ${hvacDrop} GPP (below the recommended ≥10 GPP threshold).`,
        affectedGpp,
        outsideGpp: outside?.gpp,
        unaffectedGpp: unaffected?.gpp,
        hvacDropGpp: hvacDrop,
        hvacGrainDepression: hvacDrop,
        recommendation: 'Check dehumidifier coils, HVAC filters, and chamber temperature. Inadequate grain depression indicates inefficient moisture removal.'
      };
    }
    return {
      level: 'normal',
      severity: 'normal',
      isAlert: false,
      title: 'Active Grain Depression Confirmed',
      message: `Dehumidification / HVAC drop is healthy at ${hvacDrop} GPP depression. Moisture is actively being removed from the chamber.`,
      affectedGpp,
      outsideGpp: outside?.gpp,
      unaffectedGpp: unaffected?.gpp,
      hvacDropGpp: hvacDrop,
      hvacGrainDepression: hvacDrop,
      recommendation: 'Continue monitoring 24/7 until target dry goals on tracked materials are achieved.'
    };
  }

  // Check unaffected baseline
  if (unaffected) {
    const diff = Math.round((affectedGpp - unaffected.gpp) * 10) / 10;
    if (diff > 25) {
      return {
        level: 'warning',
        severity: 'warning',
        isAlert: true,
        title: 'Elevated Chamber GPP vs Unaffected Baseline',
        message: `Affected chamber GPP (${affectedGpp}) remains ${diff} grains above unaffected baseline (${unaffected.gpp}). High moisture differential detected.`,
        affectedGpp,
        outsideGpp: outside?.gpp,
        unaffectedGpp: unaffected.gpp,
        hvacDropGpp: hvacDrop,
        hvacGrainDepression: hvacDrop,
        recommendation: 'Continue structural drying. Target chamber GPP equal to or below the unaffected structure baseline.'
      };
    }
  }

  return {
    level: 'normal',
    severity: 'normal',
    isAlert: false,
    title: 'Psychrometric Readings Logged',
    message: `Chamber GPP: ${affectedGpp}. Ambient readings are within optimal operational range.`,
    affectedGpp,
    outsideGpp: outside?.gpp,
    unaffectedGpp: unaffected?.gpp,
    hvacDropGpp: hvacDrop,
    hvacGrainDepression: hvacDrop,
    recommendation: 'Log daily moisture content across all pins to track dry standard progress.'
  };
}
