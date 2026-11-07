import { 
  Project, 
  WaterCategory, 
  LossClass, 
  DigitalChecklistPhase, 
  ChecklistItem,
  AdaptiveMitigationConfig,
  MitigationProjectType,
  MitigationLossSource,
  ChemicalTreatmentLog,
  EquipmentDeployedLog,
  MoistureReadingEntry,
  SmartDigitalForm,
  MitigationSOPSummary
} from '../types';

/**
 * Derives default adaptive mitigation config based on project metadata.
 */
export function deriveAdaptiveConfig(project: Project): AdaptiveMitigationConfig {
  if (project.adaptiveConfig) {
    return project.adaptiveConfig;
  }

  // Detect project type
  const address = project.address?.toLowerCase() || '';
  const client = project.client?.toLowerCase() || '';
  let projectType: MitigationProjectType = 'Residential - Single Family';
  if (address.includes('ste') || address.includes('suite') || address.includes('bldg') || address.includes('plaza') || address.includes('corp') || client.includes('corp') || client.includes('inc') || client.includes('office')) {
    projectType = 'Commercial - Office / Corporate';
  } else if (address.includes('apt') || address.includes('unit') || address.includes('condo')) {
    projectType = 'Residential - Multi-Family / Condo';
  } else if (address.includes('medical') || address.includes('clinic') || address.includes('health')) {
    projectType = 'Commercial - Healthcare / Clinic';
  }

  // Detect loss source
  const summary = (project.summary || '').toLowerCase();
  let lossSource: MitigationLossSource = 'Clean Water Pipe Burst / Supply Line';
  if (summary.includes('sewage') || summary.includes('backup') || summary.includes('blackwater') || summary.includes('toilet') || project.waterCategory === WaterCategory.CAT_3) {
    lossSource = 'Sewage Backup / Blackwater Backflow';
  } else if (summary.includes('flood') || summary.includes('river') || summary.includes('groundwater')) {
    lossSource = 'Groundwater Infiltration / Overland Flood';
  } else if (summary.includes('appliance') || summary.includes('dishwasher') || summary.includes('washer') || summary.includes('heater')) {
    lossSource = 'Appliance Failure / Overflow';
  } else if (summary.includes('roof') || summary.includes('rain') || summary.includes('storm')) {
    lossSource = 'Roof Leak / Storm Intrusion';
  } else if (summary.includes('mold') || summary.includes('microbial')) {
    lossSource = 'Microbial / Mold Amplification';
  }

  // Category and Class
  const category = project.waterCategory || (summary.includes('cat 3') || summary.includes('sewage') ? WaterCategory.CAT_3 : summary.includes('cat 2') ? WaterCategory.CAT_2 : WaterCategory.CAT_1);
  const lossClass = project.lossClass || (summary.includes('class 4') ? LossClass.CLASS_4 : summary.includes('class 3') ? LossClass.CLASS_3 : summary.includes('class 2') ? LossClass.CLASS_2 : LossClass.CLASS_1);

  // Calculate estimated affected square footage from rooms
  const roomsSqFt = project.rooms?.reduce((acc, r) => {
    const l = r.dimensions?.length || 14;
    const w = r.dimensions?.width || 16;
    return acc + (l * w);
  }, 0) || 450;

  const isCat3 = category === WaterCategory.CAT_3;
  const isPre1985 = !!project.riskProfile?.asbestosLeadRisk || false;

  const affectedAreas = project.rooms && project.rooms.length > 0
    ? project.rooms.map((r) => r.name)
    : ['Living Room', 'Hallway', 'Kitchen Perimeter'];

  const materialsImpacted = project.dryingMonitor && project.dryingMonitor.length > 0
    ? Array.from(new Set(project.dryingMonitor.map((m) => m.name)))
    : isCat3
    ? ['5/8" Drywall (Lower 24")', 'Fiberglass Batt Insulation', 'Carpet & Pad (Non-Salvageable)', '2x4 Sill Plates', 'OSB Subfloor']
    : ['5/8" Drywall', 'Baseboard Trim', '2x4 Framing Studs', 'OSB Subfloor'];

  const baseConfig: AdaptiveMitigationConfig = {
    projectType,
    lossSource,
    waterCategory: category,
    lossClass,
    affectedSqFt: roomsSqFt,
    standingWaterDepthInches: isCat3 ? 1.5 : 0.25,
    moldIdentified: summary.includes('mold') || isCat3,
    pre1985Structure: isPre1985,
    occupancyStatus: projectType.startsWith('Commercial') ? 'Commercial Active Operations' : 'Owner Occupied',
    containmentRequired: isCat3 || summary.includes('mold') || projectType.includes('Healthcare'),
    negativeAirRequired: isCat3 || summary.includes('mold') || projectType.includes('Healthcare'),
    powerSource: 'Grid Utility (Standard)',
    clientName: project.client || 'Property Owner',
    clientPhone: project.clientPhone || '(555) 234-5678',
    clientEmail: project.clientEmail || 'client@property.com',
    propertyAddress: project.address || 'Project Site Address',
    inspectionDate: project.inspectedDate || project.startDate || new Date().toISOString().slice(0, 10),
    technicianName: project.assignedTeam?.[0] || project.projectManager || 'Alex M. (IICRC WRT/AMRT Lead)',
    affectedAreas,
    materialsImpacted,
    equipmentUsed: []
  };

  const metrics = calculateEquipmentMetrics(baseConfig);
  baseConfig.equipmentUsed = [
    `${metrics.airMovers}x Axial/Centrifugal Air Movers`,
    `${metrics.lgrCount}x LGR Dehumidifiers (${metrics.ahamPintsRequired} AHAM PPD)`,
    ...(metrics.scrubberCount > 0 ? [`${metrics.scrubberCount}x HEPA 500 CFM Air Scrubbers`] : ['1x Weighted Extraction Unit & HEPA Vacuum'])
  ];
  baseConfig.generatedSOP = generateSummarySOP(baseConfig);

  return baseConfig;
}

/**
 * Calculates recommended IICRC S500 equipment metrics based on adaptive config.
 */
export function calculateEquipmentMetrics(config: AdaptiveMitigationConfig) {
  const sqFt = Math.max(100, config.affectedSqFt);
  const ceilingHeight = 8;
  const cuFt = sqFt * ceilingHeight;

  // Air movers: 1 for every 10-16 LF of affected perimeter + 1 per offset/closet
  const approxPerimeterLF = Math.round(4 * Math.sqrt(sqFt));
  const airMovers = Math.max(2, Math.ceil(approxPerimeterLF / 14) + 1);

  // Dehumidifier calculation based on IICRC S500 formula
  let dehuDivider = 100; // Class 1
  if (config.lossClass === LossClass.CLASS_2) dehuDivider = 40;
  if (config.lossClass === LossClass.CLASS_3) dehuDivider = 30;
  if (config.lossClass === LossClass.CLASS_4) dehuDivider = 25;

  const ahamPintsRequired = Math.round(cuFt / dehuDivider);
  const lgrCount = Math.max(1, Math.ceil(ahamPintsRequired / 110)); // assuming standard 110-130 PPD LGR

  // HEPA Air Scrubbers (target 4 to 6 air changes per hour)
  const requiredCFM = Math.round((cuFt * 6) / 60);
  const scrubberCount = config.negativeAirRequired || config.waterCategory === WaterCategory.CAT_3 || config.moldIdentified
    ? Math.max(1, Math.ceil(requiredCFM / 500))
    : 0;

  return {
    cuFt,
    approxPerimeterLF,
    airMovers,
    ahamPintsRequired,
    lgrCount,
    scrubberCount,
    requiredCFM,
    containmentLevel: config.waterCategory === WaterCategory.CAT_3 || config.moldIdentified
      ? 'Full Critical 6-Mil Poly Barrier with Negative Air Pressure (-0.02 in. w.g.)'
      : config.lossClass === LossClass.CLASS_3 || config.containmentRequired
      ? 'Source Chamber Isolation & Vapour Retarder Barrier'
      : 'Standard Drying Chamber Perimeter Isolation'
  };
}

/**
 * Generates a tailored Standard Operating Procedure (SOP) summary based on project type,
 * water category, loss class, and building materials impacted.
 */
export function generateSummarySOP(config: AdaptiveMitigationConfig): MitigationSOPSummary {
  const metrics = calculateEquipmentMetrics(config);
  const isCat3 = config.waterCategory === WaterCategory.CAT_3;
  const isCat2 = config.waterCategory === WaterCategory.CAT_2;
  const isCommercial = config.projectType.startsWith('Commercial') || config.projectType.startsWith('Industrial');
  const isHealthcare = config.projectType.includes('Healthcare');
  const isMultiFamily = config.projectType.includes('Multi-Family');
  const isClass4 = config.lossClass === LossClass.CLASS_4;

  const projectCode = isHealthcare
    ? 'SOP-HC-ICRA'
    : isCommercial
    ? 'SOP-COM-S500'
    : isMultiFamily
    ? 'SOP-MF-S500'
    : 'SOP-RES-S500';

  const executiveDirective = isHealthcare
    ? `Execute ICRA Class IV & ANSI/IICRC S500 hospital-grade mitigation across ${config.affectedSqFt} sq. ft. Maintain continuous negative pressure (-0.02" w.g.) with HEPA-filtered exhaust prior to any substrate disturbance.`
    : isCommercial
    ? `Execute commercial continuity mitigation across ${config.affectedSqFt} sq. ft. (${config.projectType}) for ${config.waterCategory}. Coordinate lock-out/tag-out, common-area egress protection, and high-capacity LGR/Desiccant drying.`
    : isMultiFamily
    ? `Execute multi-unit water intrusion protocol across ${config.affectedSqFt} sq. ft. Inspect party walls, acoustic ceiling assemblies, and lower-tier units for vertical water migration under ${config.waterCategory} protocol.`
    : `Execute residential structural stabilization and psychrometric drying across ${config.affectedSqFt} sq. ft. for ${config.waterCategory} (${config.lossClass}) originating from ${config.lossSource}.`;

  const containmentAndAirflowProtocol = isCat3 || config.moldIdentified || isHealthcare
    ? `Erect 6-mil fire-retardant polyethylene critical barriers with zippered airlock entry. Establish negative air pressure (-0.02 in. w.g. verified via digital manometer) using ${Math.max(1, metrics.scrubberCount)} HEPA 500 CFM Air Scrubber(s) achieving ≥6 ACH (${metrics.requiredCFM} CFM). Isolate HVAC supply/return registers in affected zones.`
    : `Isolate drying chamber perimeter from unaffected living areas using 4-mil/6-mil poly chamber curtains to minimize chamber volume (${metrics.cuFt} cu. ft.) and maximize grain depression efficiency.`;

  const demolitionAndSalvageThreshold = isCat3
    ? `Category 3 Blackwater Non-Salvageable Mandate (IICRC S500 Sec 10.4): Remove and double-bag all porous materials contacted by water including carpet, cushion pad, baseboards, and wet insulation. Execute plumb flood cuts at ${Math.max(24, Math.ceil(config.standingWaterDepthInches + 24))}" above highest waterline.${config.pre1985Structure ? ' MANDATORY STOP: Collect ACM/Lead bulk samples prior to cutting pre-1985 drywall/mastic.' : ''}`
    : isCat2
    ? `Category 2 Graywater Protocol: Remove and discard saturated carpet cushion pad and delaminated porous trim. Evaluate drywall wicking; execute 12"–24" flood cuts or drill weep/vent holes behind baseboard if framing MC > 20%.`
    : `Category 1 Sanitary Salvage Protocol: Perform multi-pass weighted extraction on carpet/pad; preserve in-place where delaminating thresholds are not exceeded. Remove baseboards and drill cavity ventilation holes where wall MC exceeds 16%.`;

  const antimicrobialAndMoldProtocol = isCat3 || config.moldIdentified
    ? `ANSI/IICRC S520 & S500 Biocide Protocol: HEPA-vacuum all exposed framing and subfloors (99.97% @ 0.3µm). Apply EPA-registered broad-spectrum botanical thymol or quaternary disinfectant via low-pressure coarse spray; enforce minimum 10-minute wet dwell time before initiating high-velocity air movement.`
    : `Preventative Mold Inhibition Protocol: Maintain chamber RH below 50% within 24 hours to prevent fungal spore germination on damp cellulosic materials (${(config.materialsImpacted || []).slice(0, 3).join(', ') || 'drywall/framing'}). Apply EPA-registered antimicrobial treatment to sill plates and wet subflooring.`;

  const dryingTargetAndVerification = isClass4
    ? `Class 4 Bound-Water Specialty Drying: Deploy ${metrics.lgrCount} LGR/Desiccant dehumidifier(s) (${metrics.ahamPintsRequired} PPD) plus negative-pressure floor drying mats / cavity injection. Verify dryness when wood framing reaches ≤12% MC and masonry/hardwood is within 2–4% of unaffected baseline control.`
    : `Psychrometric Target: Operate ${metrics.airMovers} air movers and ${metrics.lgrCount} LGR dehumidifier(s) (${metrics.ahamPintsRequired} AHAM PPD) to maintain chamber temp 72°F–85°F and <45 GPP. Sign off only after all tracked materials (${(config.materialsImpacted || []).join(', ') || 'Drywall, Framing, Subfloor'}) reach unaffected dry standards (<10% drywall, <12% wood framing) for 2 consecutive days.`;

  const steps: MitigationSOPSummary['steps'] = [
    {
      phase: '1. Initial Inspection & Hazard Control',
      standardRef: 'IICRC S500 Sec 8 & 10.1',
      directive: `Confirm source shutoff (${config.lossSource}), perform non-invasive thermal/RF moisture mapping across ${(config.affectedAreas || []).join(', ') || 'affected rooms'}, and establish baseline dry standards.`,
      criticalControlPoint: config.pre1985Structure ? 'Pre-1985 Asbestos/Lead clearance required prior to disturbing drywall or vinyl tile.' : 'Electrical circuit isolation & slip/trip hazard clearance.',
      requiredPPE: isCat3 ? 'Tyvek suit, P100/N95 respirator, nitrile + heavy work gloves, waterproof boots' : 'Nitrile gloves, safety glasses, slip-resistant boots'
    },
    {
      phase: '2. Containment & Negative Air Setup',
      standardRef: 'IICRC S500 Sec 10.3 / S520 Sec 12',
      directive: containmentAndAirflowProtocol,
      criticalControlPoint: isCat3 || config.moldIdentified ? 'Verify -0.02 in. w.g. pressure differential & seal HVAC returns.' : 'Seal chamber openings to prevent moisture migration into unaffected zones.',
      requiredPPE: isCat3 || config.moldIdentified ? 'Half-face P100 respirator, eye protection, protective coveralls' : 'Standard field PPE'
    },
    {
      phase: '3. Water Extraction & Controlled Demo',
      standardRef: 'IICRC S500 Sec 10.4',
      directive: demolitionAndSalvageThreshold,
      criticalControlPoint: 'Mechanical extraction removes water 500x faster than dehumidification; extract until zero free water yields.',
      requiredPPE: isCat3 ? 'Full splash face shield, P100 respirator, waterproof boots, cut-resistant gloves' : 'Cut-resistant gloves, N95 dust mask, eye protection'
    },
    {
      phase: '4. Structural Drying & Airflow Placement',
      standardRef: 'IICRC S500 Sec 11.2',
      directive: `Deploy ${metrics.airMovers} air movers at 15°–45° wall angles across ${metrics.approxPerimeterLF} LF perimeter (1 per 10–16 LF + offsets) to strip boundary layer moisture.`,
      criticalControlPoint: 'Verify each 15A branch circuit does not exceed 12A continuous load (NEC 80% rule).',
      requiredPPE: 'Hearing protection (high dB array), electrical circuit tester'
    },
    {
      phase: '5. Dehumidification & Psychrometric Balance',
      standardRef: 'IICRC S500 Sec 11.3 & 12.2',
      directive: `Operate ${metrics.lgrCount} LGR dehumidifier(s) rated for ${metrics.ahamPintsRequired} AHAM pints/day (${config.lossClass}). Route condensate lines to secure sanitary drains.`,
      criticalControlPoint: 'Dehumidifier exhaust GPP must show ≥10–15 GPP grain depression below ambient chamber intake.',
      requiredPPE: 'Standard field PPE'
    },
    {
      phase: '6. Mold Prevention & EPA Biocide Protocol',
      standardRef: 'IICRC S520 / FIFRA EPA Label',
      directive: antimicrobialAndMoldProtocol,
      criticalControlPoint: 'Observe strict 10-minute wet dwell time and log EPA Registration Number & SDS disclosure.',
      requiredPPE: 'Organic vapor / P100 respirator, chemical splash goggles, nitrile gloves'
    },
    {
      phase: '7. Final Walkthrough & Completion Sign-Off',
      standardRef: 'IICRC S500 Sec 12.5 & 14',
      directive: dryingTargetAndVerification,
      criticalControlPoint: 'Obtain final pin-meter verification photos, decontaminate equipment, and execute dual Technician/Client sign-off.',
      requiredPPE: 'Standard field inspection PPE'
    }
  ];

  return {
    sopId: `${projectCode}-${new Date().getFullYear()}`,
    title: `${config.projectType} — ${config.waterCategory.split(' (')[0]} / ${config.lossClass.split(' (')[0]} Standard Operating Procedure`,
    generatedAt: new Date().toLocaleString(),
    projectType: config.projectType,
    lossSource: config.lossSource,
    waterCategory: config.waterCategory,
    lossClass: config.lossClass,
    executiveDirective,
    containmentAndAirflowProtocol,
    demolitionAndSalvageThreshold,
    antimicrobialAndMoldProtocol,
    dryingTargetAndVerification,
    steps
  };
}

/**
 * Generates the 7 comprehensive, adaptive checklist sections:
 * 1. Initial Inspection
 * 2. Containment
 * 3. Water Extraction
 * 4. Drying
 * 5. Dehumidification
 * 6. Mold Prevention
 * 7. Final Walkthrough
 */
export function generateAdaptiveChecklistPhases(
  config: AdaptiveMitigationConfig,
  currentProject?: Project
): DigitalChecklistPhase[] {
  const isCat3 = config.waterCategory === WaterCategory.CAT_3;
  const isCat2 = config.waterCategory === WaterCategory.CAT_2;
  const isCommercial = config.projectType.startsWith('Commercial') || config.projectType.startsWith('Industrial');
  const isFlood = config.lossSource.includes('Flood') || config.lossSource.includes('Groundwater');
  const isMold = config.moldIdentified || config.lossSource.includes('Mold');
  const isClass4 = config.lossClass === LossClass.CLASS_4;

  const metrics = calculateEquipmentMetrics(config);
  const areasList = (config.affectedAreas && config.affectedAreas.length > 0)
    ? config.affectedAreas.join(', ')
    : 'Living Room, Hallway';
  const materialsList = (config.materialsImpacted && config.materialsImpacted.length > 0)
    ? config.materialsImpacted.join(', ')
    : 'Drywall, Baseboards, Subfloor';

  // SECTION 1: Initial Inspection
  const phase1Inspection: ChecklistItem[] = [
    {
      id: 'sec1_source_shutoff',
      label: `Verify water source shutoff and document intrusion origin (${config.lossSource})`,
      completed: true,
      iicrcStandard: 'IICRC S500 Sec 10.1',
      category: 'Initial Inspection',
      priority: 'critical',
      notes: `Inspected by ${config.technicianName || 'Lead Tech'} on ${config.inspectionDate || 'site arrival'}.`
    },
    {
      id: 'sec1_safety_electrical',
      label: 'Execute electrical hazard, slip/fall, and overhead ceiling sag safety inspection before entry',
      completed: true,
      iicrcStandard: 'OSHA 1910 / IICRC S500 Sec 8.2',
      category: 'Initial Inspection',
      priority: 'critical',
      notes: config.standingWaterDepthInches > 0.5
        ? `Standing water (${config.standingWaterDepthInches}") detected. Subfloor ground-fault circuits isolated.`
        : 'Electrical circuits verified safe for instrumentation.'
    },
    {
      id: 'sec1_cat_class_id',
      label: `Classify water contamination (${config.waterCategory}) and evaporation load (${config.lossClass})`,
      completed: true,
      iicrcStandard: 'IICRC S500 Sec 10.2',
      category: 'Initial Inspection',
      priority: 'critical',
      isAdaptive: true,
      notes: `Affected areas mapped (${config.affectedSqFt} sq. ft.): ${areasList}`
    },
    {
      id: 'sec1_thermal_moisture_map',
      label: `Map moisture migration across impacted materials (${materialsList}) using FLIR thermal & pin/non-invasive meters`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 12.1',
      category: 'Initial Inspection',
      priority: 'high',
      fieldType: 'moisture',
      isAdaptive: true,
      notes: 'Establish dry standards in unaffected control rooms (Drywall ≤10% MC, Wood Framing ≤12% MC).'
    }
  ];

  if (config.pre1985Structure) {
    phase1Inspection.push({
      id: 'sec1_pre1985_hazmat',
      label: 'Pre-1985 Structure: Collect Asbestos (ACM) & Lead-Based Paint (EPA RRP) samples prior to disturbing substrates',
      completed: false,
      iicrcStandard: 'EPA 40 CFR 745 / OSHA 1926.1101',
      category: 'Initial Inspection',
      priority: 'critical',
      isAdaptive: true,
      notes: 'Mandatory regulatory hold on destructive demolition until lab clearance.'
    });
  }

  if (isCommercial) {
    phase1Inspection.push({
      id: 'sec1_commercial_coord',
      label: `Commercial Protocol (${config.projectType}): Coordinate with facility engineer, log MSDS access, and protect common egress`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 13.2',
      category: 'Initial Inspection',
      priority: 'high',
      isAdaptive: true
    });
  }

  // SECTION 2: Containment
  const phase2Containment: ChecklistItem[] = [
    {
      id: 'sec2_chamber_isolation',
      label: `Erect ${metrics.containmentLevel} around ${areasList}`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.3 / S520 Sec 12.2',
      category: 'Containment',
      priority: isCat3 || isMold ? 'critical' : 'high',
      isAdaptive: true,
      notes: `Chamber volume isolated to ${metrics.cuFt.toLocaleString()} cu. ft. using 6-mil flame-retardant polyethylene.`
    },
    {
      id: 'sec2_hvac_isolation',
      label: 'Seal all HVAC supply and return vents within affected zones using 6-mil poly and high-tack restoration tape',
      completed: false,
      iicrcStandard: 'IICRC S520 Sec 12.2.3',
      category: 'Containment',
      priority: 'critical',
      notes: 'Prevents cross-contamination of aerosolized particulates or moisture through building ductwork.'
    },
    {
      id: 'sec2_floor_walkoff',
      label: 'Install tacky walk-off mats and zipper airlock decon vestibule at containment entry/exit points',
      completed: false,
      iicrcStandard: 'IICRC S520 Sec 12.2',
      category: 'Containment',
      priority: 'normal'
    }
  ];

  if (config.negativeAirRequired || isCat3 || isMold) {
    phase2Containment.push({
      id: 'sec2_negative_air_setup',
      label: `Establish negative air pressure (-0.02 in. w.g.) with ${Math.max(1, metrics.scrubberCount)} HEPA 500 CFM Air Scrubber(s) (${metrics.requiredCFM} CFM for 6 ACH)`,
      completed: false,
      iicrcStandard: 'IICRC S520 Sec 12.3',
      category: 'Containment',
      priority: 'critical',
      fieldType: 'equipment',
      isAdaptive: true,
      notes: 'Verify inward poly deflection and log digital manometer reading.'
    });
  }

  // SECTION 3: Water Extraction
  const phase3Extraction: ChecklistItem[] = [
    {
      id: 'sec3_bulk_extraction',
      label: config.standingWaterDepthInches > 0
        ? `Extract standing water (${config.standingWaterDepthInches}" depth) across ${config.affectedSqFt} sq. ft. using submersible pump / truckmount extractor`
        : `Perform multi-pass weighted rover/wand extraction across ${config.affectedSqFt} sq. ft. affected flooring`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.4',
      category: 'Water Extraction',
      priority: 'critical',
      isAdaptive: true,
      notes: 'Physical extraction is 500x more efficient than evaporative dehumidification.'
    },
    {
      id: 'sec3_cavity_water_release',
      label: 'Check and release trapped water pockets in ceiling plenums, cabinet toe-kicks, and wall base channels',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.4.3',
      category: 'Water Extraction',
      priority: 'high'
    }
  ];

  if (isCat3 || isFlood) {
    phase3Extraction.push({
      id: 'sec3_cat3_porous_removal',
      label: `Category 3 Controlled Demo: Remove & double-bag contaminated carpet, pad, and wet insulation; execute ${Math.max(24, Math.ceil(config.standingWaterDepthInches + 24))}" flood cuts`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.4.1',
      category: 'Water Extraction',
      priority: 'critical',
      isAdaptive: true,
      notes: 'All porous materials contacted by Category 3 blackwater are non-salvageable.'
    });
  } else if (isCat2) {
    phase3Extraction.push({
      id: 'sec3_cat2_pad_removal',
      label: 'Category 2 Protocol: Detach carpet, extract and dispose of contaminated carpet cushion pad, and remove baseboard trim',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.4.2',
      category: 'Water Extraction',
      priority: 'high',
      isAdaptive: true
    });
  } else {
    phase3Extraction.push({
      id: 'sec3_cat1_in_place',
      label: 'Category 1 In-Place Extraction: Perform weighted extraction on carpet/pad and drill weep/vent holes behind baseboards',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.4.1',
      category: 'Water Extraction',
      priority: 'normal',
      isAdaptive: true
    });
  }

  // SECTION 4: Drying
  const phase4Drying: ChecklistItem[] = [
    {
      id: 'sec4_air_mover_calc',
      label: `Deploy ${metrics.airMovers} Air Movers across ${metrics.approxPerimeterLF} LF affected perimeter (1 unit per 10–16 LF + offsets)`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 11.2',
      category: 'Drying',
      priority: 'critical',
      fieldType: 'equipment',
      isAdaptive: true,
      notes: `Positioned at 15°–45° angle to walls in ${areasList} to create continuous laminar boundary-layer airflow.`
    },
    {
      id: 'sec4_wall_cavity_airflow',
      label: `Direct high-pressure cavity drying / baseboard vent airflow across impacted substrates (${materialsList})`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 11.2.2',
      category: 'Drying',
      priority: 'high',
      isAdaptive: true
    },
    {
      id: 'sec4_electrical_load',
      label: `Verify electrical load balance on (${config.powerSource}) — maintain ≤12A per 15A circuit (NEC 80% rule)`,
      completed: false,
      iicrcStandard: 'NFPA 70 / NEC 80% Rule',
      category: 'Drying',
      priority: 'critical'
    }
  ];

  if (isClass4) {
    phase4Drying.push({
      id: 'sec4_class4_specialty',
      label: 'Class 4 Specialty Drying: Install negative-pressure floor drying mats / Injectidry cavity system for bound water in hardwood/concrete',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 12.4',
      category: 'Drying',
      priority: 'critical',
      isAdaptive: true
    });
  }

  // SECTION 5: Dehumidification
  const phase5Dehumidification: ChecklistItem[] = [
    {
      id: 'sec5_dehu_sizing',
      label: `Install ${metrics.lgrCount} LGR Dehumidifier(s) providing ≥${metrics.ahamPintsRequired} AHAM pints/day for ${metrics.cuFt.toLocaleString()} cu. ft. (${config.lossClass})`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 11.3',
      category: 'Dehumidification',
      priority: 'critical',
      fieldType: 'equipment',
      isAdaptive: true,
      notes: 'Formula calibrated to chamber volume and Loss Class evaporation factor.'
    },
    {
      id: 'sec5_condensate_routing',
      label: 'Secure dehumidifier condensate pump discharge hoses into approved sanitary drain and test float switch',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 11.3.2',
      category: 'Dehumidification',
      priority: 'high'
    },
    {
      id: 'sec5_psychrometric_gpp',
      label: 'Log daily ambient Temp, RH%, and GPP vs. Dehumidifier exhaust to confirm ≥12 GPP grain depression',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 12.2',
      category: 'Dehumidification',
      priority: 'critical',
      fieldType: 'moisture',
      notes: 'Maintain chamber temperature between 72°F and 85°F for peak LGR water removal.'
    }
  ];

  // SECTION 6: Mold Prevention
  const phase6MoldPrevention: ChecklistItem[] = [
    {
      id: 'sec6_hepa_vac',
      label: 'Perform HEPA vacuuming (99.97% @ 0.3 microns) of all exposed framing studs, sill plates, and subflooring',
      completed: false,
      iicrcStandard: 'ANSI/IICRC S520 Sec 12.1',
      category: 'Mold Prevention',
      priority: 'high'
    },
    {
      id: 'sec6_epa_antimicrobial',
      label: isCat3 || isMold
        ? 'Apply EPA-registered hospital-grade disinfectant / botanical antimicrobial (Benefect Decon 30 / Mediclean QGC) to all exposed framing'
        : 'Apply EPA-registered antimicrobial biocide to damp sill plates and subflooring to inhibit fungal amplification',
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 10.5 / FIFRA',
      category: 'Mold Prevention',
      priority: 'critical',
      fieldType: 'chemical',
      isAdaptive: true,
      notes: 'Document EPA Registration Number, active ingredient, square footage treated, and minimum 10-minute wet dwell time.'
    },
    {
      id: 'sec6_rh_control_48h',
      label: 'Confirm chamber Relative Humidity drops below 50% RH within first 24–48 hours to prevent mold spore germination',
      completed: false,
      iicrcStandard: 'IICRC S500 / EPA Mold Guidelines',
      category: 'Mold Prevention',
      priority: 'critical',
      isAdaptive: true
    },
    {
      id: 'sec6_sds_disclosure',
      label: 'Log Chemical SDS disclosure and verify occupant/pet re-entry safety clearance',
      completed: false,
      iicrcStandard: 'OSHA HazCom / IICRC S500 Sec 5.3',
      category: 'Mold Prevention',
      priority: 'high'
    }
  ];

  // SECTION 7: Final Walkthrough
  const phase7FinalWalkthrough: ChecklistItem[] = [
    {
      id: 'sec7_dry_standard_verified',
      label: `Verify all impacted materials (${materialsList}) have achieved target Dry Standard (within 2–4% of control) across ${areasList}`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 12.5',
      category: 'Final Walkthrough',
      priority: 'critical',
      fieldType: 'moisture',
      isAdaptive: true
    },
    {
      id: 'sec7_equipment_decon_removal',
      label: 'Decontaminate, wipe down, and remove all deployed drying equipment, containment poly, and tape residue',
      completed: false,
      iicrcStandard: 'IICRC S520 Sec 14.1',
      category: 'Final Walkthrough',
      priority: 'high'
    },
    {
      id: 'sec7_visual_odor_check',
      label: 'Conduct final visual and olfactory inspection confirming zero residual moisture, staining, or microbial odor',
      completed: false,
      iicrcStandard: 'ANSI/IICRC S500 & S520 Sec 14',
      category: 'Final Walkthrough',
      priority: 'high'
    },
    {
      id: 'sec7_completion_signoff',
      label: `Execute final walkthrough with ${config.clientName || 'Client'} and capture Completion Sign-Off & Certificate of Satisfaction (COS)`,
      completed: false,
      iicrcStandard: 'IICRC S500 Sec 14 Closeout',
      category: 'Final Walkthrough',
      priority: 'critical'
    }
  ];

  const phases: DigitalChecklistPhase[] = [
    {
      id: 'phase_1_inspection',
      title: '1. Initial Inspection',
      subtitle: `Source Verification • ${config.waterCategory} • Moisture Mapping`,
      iconName: 'Search',
      status: 'in_progress',
      items: phase1Inspection,
      signature: currentProject?.digitalChecklists?.[0]?.signature
    },
    {
      id: 'phase_2_containment',
      title: '2. Containment',
      subtitle: `${metrics.containmentLevel}`,
      iconName: 'Shield',
      status: 'pending',
      items: phase2Containment,
      signature: currentProject?.digitalChecklists?.[1]?.signature
    },
    {
      id: 'phase_3_extraction',
      title: '3. Water Extraction',
      subtitle: `${config.affectedSqFt} Sq Ft • ${config.standingWaterDepthInches}" Depth • Salvageability Demo`,
      iconName: 'Waves',
      status: 'pending',
      items: phase3Extraction,
      signature: currentProject?.digitalChecklists?.[2]?.signature
    },
    {
      id: 'phase_4_drying',
      title: '4. Drying',
      subtitle: `${metrics.airMovers} Air Movers • ${metrics.approxPerimeterLF} LF Perimeter • Cavity Airflow`,
      iconName: 'Wind',
      status: 'pending',
      items: phase4Drying,
      signature: currentProject?.digitalChecklists?.[3]?.signature
    },
    {
      id: 'phase_5_dehumidification',
      title: '5. Dehumidification',
      subtitle: `${metrics.lgrCount} LGR Dehu (${metrics.ahamPintsRequired} AHAM PPD) • Grain Depression`,
      iconName: 'Gauge',
      status: 'pending',
      items: phase5Dehumidification,
      signature: currentProject?.digitalChecklists?.[4]?.signature
    },
    {
      id: 'phase_6_mold_prevention',
      title: '6. Mold Prevention',
      subtitle: isCat3 || isMold ? 'HEPA Vacuuming • EPA Disinfection • <50% RH Control' : 'Preventative Biocide • <50% RH Control',
      iconName: 'FlaskConical',
      status: 'pending',
      items: phase6MoldPrevention,
      signature: currentProject?.digitalChecklists?.[5]?.signature
    },
    {
      id: 'phase_7_final_walkthrough',
      title: '7. Final Walkthrough',
      subtitle: 'Dry Standard Verification • Equipment Removal • Completion Sign-Off',
      iconName: 'CheckCircle2',
      status: 'pending',
      items: phase7FinalWalkthrough,
      signature: currentProject?.digitalChecklists?.[6]?.signature
    }
  ];

  return phases;
}

/**
 * Generates seed chemical treatment logs if none exist.
 */
export function generateSeedChemicalLogs(project: Project): ChemicalTreatmentLog[] {
  const isCat3 = project.waterCategory === WaterCategory.CAT_3;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (isCat3) {
    return [
      {
        id: 'chem-01',
        productName: 'Benefect Decon 30 Disinfectant',
        epaRegNumber: 'EPA Reg. No. 84683-3-74771',
        activeIngredient: 'Botanical Thymol (0.05%)',
        applicationMethod: 'Low-Pressure Coarse Spray',
        targetAreas: 'Exposed 2x4 framing studs, bottom plates, subfloor & masonry slab',
        dwellTimeMinutes: 10,
        sqFtTreated: 450,
        appliedBy: 'Mike R. (Lead Technician)',
        appliedAt: dateStr,
        ppeUsed: ['Full Face Respirator', 'Tyvek Coveralls', 'Nitrile Chemical Gloves', 'Steel-toe Rubber Boots'],
        clientNotifiedOfReEntry: true,
        notes: 'Botanical active ingredient allows rapid re-entry after dwell period with zero toxic synthetic residue.'
      }
    ];
  }

  return [
    {
      id: 'chem-01',
      productName: 'Mediclean QGC Germicidal Cleaner',
      epaRegNumber: 'EPA Reg. No. 70385-6',
      activeIngredient: 'Quaternary Ammonium Chloride (0.12%)',
      applicationMethod: 'Direct Surface Saturation',
      targetAreas: 'Subfloor perimeter, baseboard cavity, wall framing',
      dwellTimeMinutes: 10,
      sqFtTreated: 320,
      appliedBy: 'Lead Tech',
      appliedAt: dateStr,
      ppeUsed: ['Safety Glasses', 'Nitrile Gloves', 'Half-mask Organic Vapor Respirator'],
      clientNotifiedOfReEntry: true,
      notes: 'Applied as preventative antimicrobial treatment under S500 guidelines.'
    }
  ];
}

/**
 * Generates seed deployed equipment logs if none exist.
 */
export function generateSeedEquipmentLogs(project: Project): EquipmentDeployedLog[] {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return [
    {
      id: 'eq-01',
      equipmentType: 'Air Mover (Axial/Centrifugal)',
      model: 'Phoenix AirMax Axial Air Mover',
      serialNumber: 'AM-4022',
      roomLocation: project.rooms?.[0]?.name || 'Main Room',
      amperage: 1.9,
      circuitVerified: true,
      targetRunHours: 72,
      actualHours: 42.5,
      deployedDate: dateStr,
      status: 'Running'
    },
    {
      id: 'eq-02',
      equipmentType: 'LGR Dehumidifier',
      model: 'Dri-Eaz LGR 3500i',
      serialNumber: 'DH-1102',
      roomLocation: project.rooms?.[0]?.name || 'Main Room',
      amperage: 8.2,
      circuitVerified: true,
      targetRunHours: 72,
      actualHours: 42.5,
      deployedDate: dateStr,
      status: 'Running'
    },
    {
      id: 'eq-03',
      equipmentType: 'HEPA Air Scrubber',
      model: 'DefendAir HEPA 500 CFM',
      serialNumber: 'AS-8891',
      roomLocation: project.rooms?.[0]?.name || 'Main Room',
      amperage: 2.5,
      circuitVerified: true,
      targetRunHours: 72,
      actualHours: 38.0,
      deployedDate: dateStr,
      status: 'Running'
    }
  ];
}

/**
 * Generates seed moisture matrix reading entries if none exist.
 */
export function generateSeedMoistureMatrix(project: Project): MoistureReadingEntry[] {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const roomName = project.rooms?.[0]?.name || 'Living Room';

  return [
    {
      id: 'mr-01',
      roomName,
      materialName: 'Drywall 5/8" (Lower 2ft)',
      readingType: 'Penetrating Pin',
      dryGoalMC: 10.0,
      baselineWetMC: 42.5,
      currentMC: 16.2,
      dateRecorded: dateStr,
      isDry: false,
      locationDetails: 'East wall under window cavity'
    },
    {
      id: 'mr-02',
      roomName,
      materialName: 'Bottom Sill Plate (2x4 Pine)',
      readingType: 'Penetrating Pin',
      dryGoalMC: 12.0,
      baselineWetMC: 36.0,
      currentMC: 18.5,
      dateRecorded: dateStr,
      isDry: false,
      locationDetails: 'Exterior foundation framing'
    },
    {
      id: 'mr-03',
      roomName,
      materialName: 'OSB Subfloor',
      readingType: 'Non-Destructive RF',
      dryGoalMC: 11.0,
      baselineWetMC: 48.0,
      currentMC: 14.8,
      dateRecorded: dateStr,
      isDry: false,
      locationDetails: 'Adjacent to plumbing source'
    },
    {
      id: 'mr-04',
      roomName,
      materialName: 'Concrete Slab Perimeter',
      readingType: 'Non-Destructive RF',
      dryGoalMC: 4.5,
      baselineWetMC: 12.5,
      currentMC: 5.1,
      dateRecorded: dateStr,
      isDry: false,
      locationDetails: 'Center slab moisture test'
    }
  ];
}

/**
 * Generates the full suite of smart, adaptive digital forms with pre-filled project data.
 */
export function generateSmartDigitalForms(
  project: Project,
  config: AdaptiveMitigationConfig
): SmartDigitalForm[] {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const clientName = project.client || 'Client Property Owner';
  const address = project.address || 'Property Address';
  const claimNo = project.claimNumber || 'CLM-PENDING';
  const policyNo = project.policyNumber || 'POL-UNSPECIFIED';
  const carrier = project.insurance || 'Carrier Direct';
  const techName = project.assignedTeam?.[0] || 'Lead Mitigation Technician';

  const moisture = project.moistureMatrix || generateSeedMoistureMatrix(project);
  const equipment = project.equipmentLogs || generateSeedEquipmentLogs(project);
  const chemicals = project.chemicalLogs || generateSeedChemicalLogs(project);

  const isCat3 = config.waterCategory === WaterCategory.CAT_3;
  const isCommercial = config.projectType.startsWith('Commercial') || config.projectType.startsWith('Industrial');

  const forms: SmartDigitalForm[] = [
    // 1. Work Authorization & Emergency Service Agreement
    {
      id: 'form-auth-01',
      formType: 'work_authorization',
      title: 'Emergency Work Authorization & Service Agreement',
      subtitle: 'Binding Contract for Water Mitigation & Structural Stabilization',
      category: 'Legal & Authorization',
      status: 'ready_for_signature',
      createdAt: dateStr,
      updatedAt: dateStr,
      data: {
        clientName,
        propertyAddress: address,
        claimNumber: claimNo,
        insuranceCarrier: carrier,
        policyNumber: policyNo,
        technicianName: techName,
        projectType: config.projectType,
        lossSource: config.lossSource,
        waterCategory: config.waterCategory,
        lossClass: config.lossClass,
        summaryNotes: `Immediate emergency mitigation required for ${config.waterCategory} water intrusion under IICRC S500 standards.`,
        deductibleAmount: '$1,000.00',
        emergencyRateApproved: true,
        authorizedDollarLimit: '$15,000.00 Initial Authorization Limit',
        customClauses: [
          {
            id: 'c1',
            title: 'Authorization to Perform Emergency Services',
            text: 'I, the Owner/Authorized Agent, hereby authorize Restoration-AI and its licensed mitigation specialists to enter the property and perform all emergency mitigation, water extraction, antimicrobials, dehumidification, and controlled structural demolition necessary to preserve property and mitigate secondary damage in accordance with ANSI/IICRC S500 standards.',
            accepted: true
          },
          {
            id: 'c2',
            title: 'Assignment of Insurance Benefits & Direct Pay',
            text: 'I hereby authorize my insurance carrier to make payment directly to the Restoration Contractor for all services rendered under this agreement. I understand that I remain responsible for any deductible, co-pays, or non-covered items.',
            accepted: true
          },
          {
            id: 'c3',
            title: 'Continuous Equipment Operation & Right of Entry',
            text: 'I agree to keep all deployed drying equipment running 24 hours a day without interruption until the lead technician verifies that the IICRC dry standard has been attained. Technicians are granted reasonable access during working hours for daily psychrometric monitoring.',
            accepted: true
          },
          ...(isCommercial ? [{
            id: 'c4',
            title: 'Commercial Facility Operations & Access',
            text: 'For commercial property operations, the designated facilities engineer shall provide after-hours clearance and notify building tenants of active mitigation.',
            accepted: true
          }] : [])
        ]
      }
    },

    // 2. Daily Mitigation & Psychrometric Moisture Log
    {
      id: 'form-log-02',
      formType: 'daily_mitigation_log',
      title: 'Daily Mitigation & Field Moisture Log',
      subtitle: 'IICRC S500 Daily Psychrometric Monitoring & Drying Verification',
      category: 'Field Compliance',
      status: 'ready_for_signature',
      createdAt: dateStr,
      updatedAt: dateStr,
      data: {
        clientName,
        propertyAddress: address,
        claimNumber: claimNo,
        insuranceCarrier: carrier,
        technicianName: techName,
        projectType: config.projectType,
        lossSource: config.lossSource,
        waterCategory: config.waterCategory,
        lossClass: config.lossClass,
        summaryNotes: 'Continuous chamber monitoring. GPP dropping toward target drying goals. Daily pin readings documented.',
        moistureReadingsSummary: moisture,
        equipmentDeployedSummary: equipment
      }
    },

    // 3. Chemical & Antimicrobial Application Disclosure
    {
      id: 'form-chem-03',
      formType: 'chemical_treatment_disclosure',
      title: 'Antimicrobial & Chemical Application Disclosure',
      subtitle: 'EPA Compliance Notice, SDS Review & Re-Entry Safety Acknowledgment',
      category: 'Safety & Chemicals',
      status: 'ready_for_signature',
      createdAt: dateStr,
      updatedAt: dateStr,
      data: {
        clientName,
        propertyAddress: address,
        claimNumber: claimNo,
        insuranceCarrier: carrier,
        technicianName: techName,
        projectType: config.projectType,
        lossSource: config.lossSource,
        waterCategory: config.waterCategory,
        lossClass: config.lossClass,
        chemicalTreatmentsSummary: chemicals,
        summaryNotes: isCat3 
          ? 'Mandatory biohazard broad-spectrum disinfection applied to framing and subfloors following Category 3 sewage/flood contamination.'
          : 'Preventative antimicrobial sanitizer applied to framing and affected subfloors to halt microbial growth.',
        customClauses: [
          {
            id: 'cc1',
            title: 'EPA Product Label Compliance',
            text: 'Restoration technicians have applied EPA-registered antimicrobial products in accordance with label instructions (FIFRA). Products are formulated to disinfect and inhibit microbial proliferation.',
            accepted: true
          },
          {
            id: 'cc2',
            title: 'Occupant Re-Entry Protocol',
            text: 'Occupants have been advised to avoid entering the treated containment zone during active application and for the duration of the required dwell/air-clearing period. Persons with severe respiratory sensitivities or pets should observe extra precaution.',
            accepted: true
          }
        ]
      }
    },

    // 4. Structural Flood Cut & Controlled Demolition Release
    {
      id: 'form-demo-04',
      formType: 'structural_demo_release',
      title: 'Scope of Controlled Demolition & Material Release',
      subtitle: 'Authorization for Flood Cuts, Subfloor Removal & Disposal of Non-Salvageable Materials',
      category: 'Legal & Authorization',
      status: 'ready_for_signature',
      createdAt: dateStr,
      updatedAt: dateStr,
      data: {
        clientName,
        propertyAddress: address,
        claimNumber: claimNo,
        insuranceCarrier: carrier,
        technicianName: techName,
        projectType: config.projectType,
        lossSource: config.lossSource,
        waterCategory: config.waterCategory,
        lossClass: config.lossClass,
        demoCutHeightInches: isCat3 ? 24 : 12,
        wasteDisposalManifestVerified: isCat3,
        summaryNotes: isCat3 
          ? 'Category 3 Blackwater loss mandates removal of all wet porous building materials (drywall, insulation, carpet, pad) per IICRC S500 Sec 10.4.'
          : 'Selective demolition required to access wet structural wall cavities and facilitate rapid drying.',
        customClauses: [
          {
            id: 'dm1',
            title: 'Controlled Flood Cut Authorization',
            text: `Technicians are authorized to execute neat, plumb flood cuts on affected sheetrock at a height of ${isCat3 ? '24 inches (or 48 inches if insulation wicking dictates)' : '12-24 inches'} above the water line to expose stud cavities for drying.`,
            accepted: true
          },
          {
            id: 'dm2',
            title: 'Disposal of Non-Salvageable Materials',
            text: 'I acknowledge that wet porous materials contaminated by contaminated water (including carpet padding, degraded wet drywall, and contaminated insulation) cannot be salvaged safely and must be bagged and hauled for disposal.',
            accepted: true
          }
        ]
      }
    },

    // 5. Equipment Placement & Energy Responsibility Agreement
    {
      id: 'form-eq-05',
      formType: 'equipment_responsibility',
      title: 'Equipment Placement & Power Responsibility Agreement',
      subtitle: 'Custody of Deployed Commercial Drying Assets & Electrical Circuit Notice',
      category: 'Field Compliance',
      status: 'ready_for_signature',
      createdAt: dateStr,
      updatedAt: dateStr,
      data: {
        clientName,
        propertyAddress: address,
        claimNumber: claimNo,
        insuranceCarrier: carrier,
        technicianName: techName,
        projectType: config.projectType,
        lossSource: config.lossSource,
        waterCategory: config.waterCategory,
        lossClass: config.lossClass,
        equipmentDeployedSummary: equipment,
        summaryNotes: 'Commercial air movers and dehumidifiers deployed. Circuits mapped and verified.',
        customClauses: [
          {
            id: 'eq1',
            title: 'Do Not Turn Off or Move Equipment',
            text: 'Client agrees NOT to turn off, unplug, or relocate any drying equipment. Interruption of drying creates elevated humidity, microbial bloom, and prolongs repair time. If equipment is powered off by client, contractor is released from drying timeline warranties.',
            accepted: true
          },
          {
            id: 'eq2',
            title: 'Electrical Consumption Acknowledgment',
            text: 'Client understands that drying equipment operates on household/facility electrical power. An electrical consumption concession or kilowatt-hour utility credit may be submitted to the insurance carrier as part of the mitigation claim.',
            accepted: true
          }
        ]
      }
    },

    // 6. Certificate of Satisfaction (COS) & Completion Sign-Off
    {
      id: 'form-cos-06',
      formType: 'certificate_of_satisfaction',
      title: 'Certificate of Completion & Customer Satisfaction (COS)',
      subtitle: 'Final Closeout Sign-Off, Dry Standard Attainment & Release of Liability',
      category: 'Closeout',
      status: 'ready_for_signature',
      createdAt: dateStr,
      updatedAt: dateStr,
      data: {
        clientName,
        propertyAddress: address,
        claimNumber: claimNo,
        insuranceCarrier: carrier,
        technicianName: techName,
        projectType: config.projectType,
        lossSource: config.lossSource,
        waterCategory: config.waterCategory,
        lossClass: config.lossClass,
        summaryNotes: 'All structural framing and affected materials have achieved IICRC S500 dry standards. All equipment removed and post-walkthrough completed.',
        moistureReadingsSummary: moisture,
        customClauses: [
          {
            id: 'cos1',
            title: 'Verification of Structural Dryness',
            text: 'I, the Property Owner / Authorized Agent, confirm that the lead mitigation technician has conducted a final psychrometric and moisture meter inspection in my presence, demonstrating that all affected assemblies have attained the established dry goals.',
            accepted: true
          },
          {
            id: 'cos2',
            title: 'Acceptance of Completed Emergency Services',
            text: 'I acknowledge that all emergency water mitigation, water extraction, controlled demolition, antimicrobial treatments, and equipment removal have been completed to my satisfaction.',
            accepted: true
          }
        ]
      }
    }
  ];

  return forms;
}
