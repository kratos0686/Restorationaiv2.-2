// --- Advanced Psychrometric Calculation Utilities ---

// Calculates Saturation Vapor Pressure (in hPa/mb) from temperature in Celsius using the Magnus formula.
export const calcSaturationVaporPressure = (tempC: number): number => {
  return 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
};

// Iteratively finds Dry Bulb Temp (°F) from Wet Bulb Temp (°F) and Relative Humidity (%).
// This is necessary because there's no direct formula; it requires solving a psychrometric equation.
export const findDryBulbFromWetBulbAndRh = (wetBulbF: number, rh: number): number => {
    if (rh >= 100) return wetBulbF; // At 100% RH, Dry Bulb = Wet Bulb.
    if (rh <= 0 || isNaN(wetBulbF) || isNaN(rh)) return NaN;

    const wetBulbC = (wetBulbF - 32) * 5 / 9;
    const P_atm_mb = 1013.25; // Standard atmospheric pressure.
    const A = 0.00066 * (1 + 0.00115 * wetBulbC); // Psychrometric constant.
    
    const e_s_wb = calcSaturationVaporPressure(wetBulbC);

    // This is the function we need to find the root of (where it equals zero).
    const errorFunc = (dryBulbC: number) => {
        return (rh / 100) * calcSaturationVaporPressure(dryBulbC) - e_s_wb + A * P_atm_mb * (dryBulbC - wetBulbC);
    };

    // Use the Bisection method for a stable and accurate solution.
    let lowC = wetBulbC;
    let highC = wetBulbC + 100; // A high upper bound, assuming Td won't be >100°C hotter than Tw.
    let midC = wetBulbC;

    for (let i = 0; i < 50; i++) { // 50 iterations provide high precision.
        midC = (lowC + highC) / 2;
        const error = errorFunc(midC);
        if (Math.abs(error) < 0.001) break; // Tolerance reached.
        if (error < 0) { lowC = midC; } else { highC = midC; }
    }
    
    return (midC * 9 / 5) + 32; // Convert result back to Fahrenheit.
};

// Calculates key psychrometric values from a known Dry Bulb Temp and RH.
export const calculatePsychrometricsFromDryBulb = (tempF: number, rh: number, pressureMb: number = 1013.25) => {
  if (isNaN(tempF) || isNaN(rh) || rh <= 0) return { gpp: 0, dewPoint: 0, vaporPressure: 0, enthalpy: 0 };
  
  const tempC = (tempF - 32) * 5 / 9;
  const pSat = calcSaturationVaporPressure(tempC);
  const pV = (rh / 100) * pSat;
  const pAtm = pressureMb;
  const humRatio = 0.62198 * (pV / (pAtm - pV)); // kg/kg or lb/lb
  const gpp = humRatio * 7000;
  
  const a = 17.27, b = 237.7;
  const alpha = ((a * tempC) / (b + tempC)) + Math.log(rh / 100);
  const dewPointC = (b * alpha) / (a - alpha);
  const dewPointF = (dewPointC * 9 / 5) + 32;

  // 1 mb = 0.02953 inHg.
  const pVInHg = pV * 0.02953;

  // Enthalpy (BTU/lb)
  // h = 0.24 * T + W * (1061 + 0.444 * T)
  // T in F, W in lb/lb
  const enthalpy = 0.24 * tempF + humRatio * (1061 + 0.444 * tempF);

  return {
    gpp: Math.round(gpp * 10) / 10,
    dewPoint: Math.round(dewPointF * 10) / 10,
    vaporPressure: Math.round(pVInHg * 100) / 100, // inHg
    enthalpy: Math.round(enthalpy * 100) / 100
  };
};

// Top-level utility: calculates all values from Wet Bulb and RH.
export const calculatePsychrometricsFromWetBulb = (wetBulbF: number, rh: number) => {
    const dryBulbF = findDryBulbFromWetBulbAndRh(wetBulbF, rh);
    if (isNaN(dryBulbF)) {
        return { dryBulb: 0, gpp: 0, dewPoint: 0, vaporPressure: 0, enthalpy: 0 };
    }
    const results = calculatePsychrometricsFromDryBulb(dryBulbF, rh);
    return {
        dryBulb: Math.round(dryBulbF * 10) / 10,
        ...results
    };
};
