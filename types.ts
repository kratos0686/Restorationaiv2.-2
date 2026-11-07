
export interface RoomMaterials {
  room_identification: string;
  materials: {
    flooring_system: {
      material_category: string;
      grade_estimation: string;
    };
    wall_system: {
      substrate_material: string;
      finish_type: string;
    };
    trim_and_millwork: {
      baseboard_material: string;
      height_inches: number;
    };
  };
}

export interface Reading {
  timestamp: number;
  temp: number; // Fahrenheit
  rh: number; // Relative Humidity %
  gpp: number; // Grains Per Pound (Calculated)
  mc: number; // Moisture Content % (Material)
  dewPoint?: number;
  vaporPressure?: number;
  enthalpy?: number;
}

export interface PsychrometricsData {
  dryBulb: number; // Fahrenheit
  relativeHumidity: number; // %
  pressure?: number; // inHg
  dewPoint: number; // Fahrenheit
  gpp: number; // Grains Per Pound
  vaporPressure: number; // inHg
  enthalpy?: number; // BTU/lb
}

export enum WaterCategory {
  CAT_1 = 'Category 1 (Sanitary Water)',
  CAT_2 = 'Category 2 (Significantly Contaminated Water)',
  CAT_3 = 'Category 3 (Grossly Contaminated Water)'
}

export enum LossClass {
  CLASS_1 = 'Class 1 (Least)',
  CLASS_2 = 'Class 2 (Significant)',
  CLASS_3 = 'Class 3 (Greatest)',
  CLASS_4 = 'Class 4 (Specialty)'
}

export interface SafetyAssessment {
  electricalSafe: boolean;
  structuralSafe: boolean;
  biohazardRisk: boolean;
  ppeRequired: string[];
  notes: string;
  completedAt: number;
}

export interface Milestone {
  title: string;
  date: string;
  status: 'completed' | 'active' | 'pending';
}

export interface SubTask {
    id: string;
    text: string;
    isCompleted: boolean;
}

export interface AITask {
    id: string;
    text: string;
    isCompleted: boolean;
    subtasks?: SubTask[];
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
}

export interface LineItem {
    id:string;
    code?: string; // e.g. WTR [BASEA]
    description: string;
  tags?: string[]; // added for video tags
    quantity: number;
    rate: number;
    total: number;
    category?: string;
}

export type MediaPhaseCategory = 'before' | 'during' | 'after' | 'specific_damage';

export interface VideoTimestampAnnotation {
  id: string;
  timestampSec: number;
  label: string;
  damageType?: string;
  notes?: string;
}

export interface Photo {
  id: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  timestamp: number;
  geolocation?: { lat: number, lng: number };
  caption?: string;
  phaseCategory?: MediaPhaseCategory;
  damageType?: string;
  roomName?: string;
  isAnnotated?: boolean;
  videoAnnotations?: VideoTimestampAnnotation[];
  tags: string[];
  notes: string;
  aiInsight?: string;
  type?: 'image' | 'video';
  meterReading?: string;
  materialLabel?: string;
  waterCategory?: string;
  affectedAreaEstimate?: string;
  damagedMaterials?: string[];
  mitigationSteps?: string[];
  linkedRoomId?: string;
  linkedTaskId?: string;
  linkedEquipmentId?: string;
}

export interface VideoLog {
  id: string;
  url: string;
  thumbnail?: string;
  timestamp: number;
  caption?: string;
  description: string;
  phaseCategory?: MediaPhaseCategory;
  damageType?: string;
  roomName?: string;
  tags?: string[];
  videoAnnotations?: VideoTimestampAnnotation[];
  linkedRoomId?: string;
  linkedTaskId?: string;
  linkedEquipmentId?: string;
}

export interface PlacedPhoto extends Photo {
  position: {
    wall: 'floor' | 'ceiling' | 'front' | 'back' | 'left' | 'right';
    x: number; // percentage from left (0-100)
    y: number; // percentage from bottom (0-100)
  };
}

export interface RoomScan {
  scanId: string;
  roomName: string;
  floorPlanSvg: string;
  dimensions: { length: number; width: number; height: number; sqft: number };
  placedPhotos: PlacedPhoto[];
  materials?: RoomMaterials;
}

export interface DryingChamber {
  id: string;
  name: string;
  roomIds: string[]; // IDs of the rooms combined into this chamber
  readings: Reading[];
  photos?: Photo[];
  status: 'active' | 'completed';
}

export interface Room {
  id: string;
  name: string;
  level?: string;
  roomType?: string;
  isDryingChamber?: boolean;
  dimensions: { length: number; width: number; height: number };
  readings: Reading[];
  photos: Photo[];
  status: 'wet' | 'drying' | 'dry';
  materials?: RoomMaterials;
}

export interface InventoryEquipment {
  id: string;
  type: string;
  model: string;
  status: 'available' | 'in_use' | 'maintenance_needed';
  currentProjectId?: string;
  lastMaintenanceDate?: string;
  notes?: string;
  history?: {
    date: string;
    action: 'checked_out' | 'checked_in' | 'maintenance';
    projectId?: string;
    notes?: string;
  }[];
}

export interface PlacedEquipment {
  id: string;
  type: 'Air Mover' | 'Dehumidifier' | 'HEPA Scrubber' | 'Heater';
  model: string;
  status: 'Running' | 'Off' | 'Removed';
  hours: number;
  room: string;
}

export interface ComplianceCheck {
    id: string;
    text: string;
    isCompleted: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  notes?: string;
  materials?: string[];
  iicrcStandard?: string;
  category?: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  fieldType?: 'moisture' | 'equipment' | 'chemical' | 'text' | 'boolean' | 'none';
  fieldData?: Record<string, unknown>;
  isAdaptive?: boolean;
}

export interface PhaseSignature {
  technicianName: string;
  technicianSignature: string; // base64 representation
  clientName: string;
  clientSignature: string;
  date: number;
  signeeRole?: string;
  ipStamp?: string;
}

export interface TimeEntry {
  id: string;
  technicianId: string;
  technicianName: string;
  clockInTime: number;
  clockOutTime?: number;
  totalHours?: number;
  visitReason: 'Monitoring' | 'Emergency Services' | 'Initial Visit' | 'Other';
  notes?: string;
  projectId?: string;
}

export interface DigitalChecklistPhase {
  id: string;
  title: string;
  subtitle?: string;
  iconName?: string;
  items: ChecklistItem[];
  signature?: PhaseSignature;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface DailyNarrative {
  id: string;
  date: string;
  timestamp: number;
  content: string;
  author: string;
  tags: string[]; // e.g., 'Equipment', 'Monitoring', 'Communication'
  generated: boolean;
  attachments?: string[]; // IDs of photos linked to this log
  // Rich Feed additions
  entryType?: 'general' | 'drying' | 'photo' | 'equipment' | 'compliance' | 'voice' | 'field_update';
  timeSpent?: number;
  data?: unknown; 
}

// --- NEW TYPES FOR MATERIAL TRACKING (MOISTURE MATRIX) ---
export interface MaterialReading {
    timestamp: number;
    value: number; // Moisture Content % or Points
    dateStr: string; // e.g. "Oct 12"
}

export interface TrackedMaterial {
    id: string;
    chamberId?: string; // Optional for backward compatibility, ties material to a drying chamber
    name: string; // e.g. "Drywall"
    location: string; // e.g. "North Wall under window"
    type: string;
    dryGoal: number; // The target dry standard (e.g. 10%)
    initialReading: number; // The baseline wet reading (e.g. 99%)
    readings: MaterialReading[]; // History of readings
    status: 'Wet' | 'Dry' | 'Removed';
    demoQuantity?: number; // Quantity removed/demoed
    pinNumber?: number;
    pinX?: number; // 0 to 1 fraction of the plan width
    pinY?: number; // 0 to 1 fraction of the plan height
    pinStatus?: 'wet' | 'drying' | 'dry' | 'stalled';
}
// ---------------------------------------------------------

export type ProjectStage = 'Intake' | 'Inspection' | 'Scope' | 'Stabilize' | 'Monitor' | 'Closeout';

// Renamed from Project to LossFile to match "Mitigate" terminology
export interface ARMarker {
  id: string;
  x: number; // percentage on site plan
  y: number; // percentage on site plan
  label: string;
  type: 'equipment' | 'damage' | 'moisture' | 'note';
  value?: string;
  equipmentType?: string;
  equipmentStatus?: 'Running' | 'Off';
  timestamp: number;
  tags?: string[];
  color?: string;
  linkedPhotos?: string[]; // Array of photo IDs
}

export interface ARArea {
  id: string;
  points: { x: number; y: number }[]; // percentage coordinates
  label: string;
  type: 'affected' | 'mitigated' | 'safe' | 'containment';
  color: string;
  timestamp: number;
  tags?: string[];
  sqFeet?: number;
  linearFeet?: number;
  linkedPhotos?: string[]; // Array of photo IDs
}

export interface ARMeasurement {
  id: string;
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  distance?: number;
}

export interface ARMappingData {
  sitePlanUrl?: string;
  markers: ARMarker[];
  areas?: ARArea[];
  measurements?: ARMeasurement[];
  scale?: number; // pixels per foot
}

export interface ProjectMilestone {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed';
  updatedAt?: number;
  updatedBy?: string;
  notes?: string;
}

export interface StatusUpdate {
  id: string;
  timestamp: string;
  message: string;
  author: string;
  photos?: string[];
}

export interface Project {
  id: string;
  arMapping?: ARMappingData;
  measurements?: ARMeasurement[];
  milestones?: ProjectMilestone[];
  statusUpdates?: StatusUpdate[];
  companyId: string;
  client: string; // Client Display Name
  clientEmail?: string;
  clientPhone?: string;
  address: string;
  
  status: string; // General status text
  currentStage: ProjectStage; // Workflow Step
  progress: number;
  
  // Dates
  lossDate?: string;
  assignedDate?: string;
  contactedDate?: string;
  inspectedDate?: string;
  startDate?: string; // Job Started
  jobPausedDate?: string;
  jobCompletedDate?: string;
  estimate?: string;
  trips?: {id: string, name: string, startDate?: string, endDate?: string}[];

  // Insurance
  insurance?: string;
  policyNumber?: string;
  adjuster?: string;
  adjusterEmail?: string;
  adjusterPhone?: string;
  claimNumber?: string; // Added claim number
  
  summary?: string;
  notes?: string;
  notesPhotos?: string[];
  logs?: string;
  dailyNarratives?: DailyNarrative[]; 
  dryingMonitor?: TrackedMaterial[]; // New field for specific material tracking
  dryingChambers?: DryingChamber[];
  riskLevel: 'low' | 'medium' | 'high';
  riskProfile?: {
    customerResponsiveness?: 'high' | 'medium' | 'low';
    materialComplexity?: 'simple' | 'moderate' | 'complex';
    asbestosLeadRisk?: boolean;
    calculatedScore?: number;
    lastAssessed?: string;
  };
  rooms: Room[];
  
  waterCategory?: WaterCategory;
  lossClass?: LossClass;
  
  tasks: AITask[];
  lineItems: LineItem[];
  totalCost: number;
  invoiceStatus: 'Draft' | 'Sent' | 'Paid';
  roomScans: RoomScan[];
  videos: VideoLog[];
  aiLearnings?: { photoId: string; imageBase64?: string; correctedData: Record<string, unknown>; timestamp: number }[];
  
  complianceChecks?: {
      asbestos: 'not_tested' | 'pending' | 'clear' | 'abatement_required';
      aiChecklist: ComplianceCheck[];
  }
  budget?: number;
  assignedTeam?: string[];
  equipment?: PlacedEquipment[];
  ticSheet?: unknown[];
  timeEntries?: TimeEntry[];
  digitalChecklists?: DigitalChecklistPhase[];
  adaptiveConfig?: AdaptiveMitigationConfig;
  chemicalLogs?: ChemicalTreatmentLog[];
  equipmentLogs?: EquipmentDeployedLog[];
  moistureMatrix?: MoistureReadingEntry[];
  smartForms?: SmartDigitalForm[];
  iicrcReport?: string;
  xactimateReport?: string;
  documentationTemplates?: ProjectDocumentationTemplates;
  referenceReadings?: ReferenceReading[];
  moisturePins?: MoistureMapPin[];
  attachedDocuments?: AttachedDocument[];
  reportProfiles?: ReportProfile[];
  activeReportProfileId?: string;
  signedAuthorizations?: SignedAuthorization[];
  carrierPacketConfig?: CarrierPacketConfig;
}

// --- NEW WATER-MITIGATION DOCUMENTATION TYPES ---
export type ReferenceReadingZone = 'outside' | 'unaffected' | 'unaffected-hvac' | 'affected-hvac';

export interface ReferenceReading {
  id?: string;
  zone: ReferenceReadingZone;
  temp: number; // Fahrenheit
  rh: number; // %
  timestamp: number;
  photoId?: string;
  gpp: number; // Grains Per Pound (calculated)
  dewPoint: number; // Dew Point °F (calculated)
  notes?: string;
}

export type MoisturePinStatus = 'wet' | 'drying' | 'dry' | 'stalled';

export interface MoistureMapPin {
  id: string;
  pinNumber: number;
  materialId: string;
  x: number; // 0 to 1 fraction of floor plan
  y: number; // 0 to 1 fraction of floor plan
  status?: MoisturePinStatus;
  label?: string;
  roomName?: string;
}

export type AttachedDocumentType = 'lab results' | 'invoices' | 'estimates' | 'other';

export interface AttachedDocument {
  id: string;
  name: string;
  type: AttachedDocumentType;
  fileReference: string; // URL, data URI, or path
  fileType?: string;
  uploadedAt?: number;
  notes?: string;
  fileSize?: string;
}

export interface ReportProfile {
  id: string;
  name: string;
  description?: string;
  targetAudience?: 'Carrier' | 'Property Manager' | 'Adjuster' | 'Homeowner' | 'General';
  isBuiltIn?: boolean;
  sectionIds: string[]; // Ordered list of section IDs
  labelOverrides?: Record<string, string>; // sectionId -> custom label
  requiredFields?: string[]; // Field keys that must be present on Project
}

export type SignedAuthorizationFormType =
  | 'work_authorization'
  | 'antimicrobial_consent'
  | 'equipment_responsibility'
  | 'certificate_of_satisfaction';

export type SignedAuthorizationRole =
  | 'Homeowner'
  | 'Property Manager'
  | 'Commercial Tenant'
  | 'Authorized Agent'
  | 'Lead Technician';

export interface SignedAuthorization {
  id: string;
  formType: SignedAuthorizationFormType;
  title: string;
  signerName: string;
  signerRole: SignedAuthorizationRole;
  signatureDataUrl: string;
  signedAt: number;
  verificationHash: string;
  clausesAccepted: string[];
}

export type SyncQueueOperation =
  | 'UPDATE_READINGS'
  | 'UPDATE_PINS'
  | 'UPDATE_EQUIPMENT'
  | 'ADD_SIGNATURE'
  | 'UPDATE_DOCUMENTS'
  | 'UPDATE_PROFILES'
  | 'FULL_PROJECT_SAVE';

export interface SyncQueueItem {
  id: string;
  projectId: string;
  operation: SyncQueueOperation;
  payload: Partial<Project>;
  queuedAt: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  description?: string;
}

export interface CarrierPacketConfig {
  profileId: string;
  includeFloorplanMap: boolean;
  includeSignatures: boolean;
  includeAttachedDocs: boolean;
}
// -------------------------------------------------

export type LossFile = Project;

export interface AIProjectData extends Project {
  aiSummary: string;
  aiAlert: {
    isAlert: boolean;
    reason: string;
  };
  priority: number;
}

export interface AppSettings {
  language: string;
  dateFormat: string;
  timeFormat: string;
  units: {
    temperature: 'Fahrenheit' | 'Celsius';
    dimension: 'Feet' | 'Inches';
    humidity: 'Relative Humidity' | 'Grains / Pound' | 'g/kg';
    volume: 'Pint' | 'Liter';
  };
  copyPhotosToGallery: boolean;
  defaultView: 'Timeline' | 'List';
}

export interface DownloadItem {
    id: string;
    label: string;
    description: string;
    checked: boolean;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  subject?: string;
}

export type Permission = 'manage_users' | 'view_billing' | 'manage_billing' | 'view_projects' | 'edit_projects' | 'view_admin' | 'use_ai_tools' | 'manage_company';

export type UserRole = 'SuperAdmin' | 'CompanyAdmin' | 'Technician';

export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    companyId: string;
    permissions: Permission[];
}

export interface Company {
    id: string;
    name: string;
    subscriptionPlan: 'Basic' | 'Pro' | 'Enterprise';
    maxUsers: number;
    isActive: boolean;
}

export interface MitigationMediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl?: string;
  name: string;
  size?: number;
  timestamp: number;
  base64?: string;
  videoDuration?: number;
  extractedFrames?: string[]; // base64 frames for video
  technicianNotes?: string;
  roomTag?: string;
  aiAnalysis?: {
    damageIdentified?: string;
    materialsDetected?: string[];
    waterCategory?: string;
    severity?: string;
    moistureSigns?: string;
    affectedAreaEstimate?: string;
  };
}

export interface AffectedMaterialAnalysis {
  name: string;
  category: 'Porous' | 'Semi-Porous' | 'Non-Porous';
  location: string;
  severity: 'Low' | 'Medium' | 'High' | 'Severe';
  salvageability: 'Salvageable' | 'Restorable In-Place' | 'Demolition Required' | 'Requires Specialized Drying';
  estimatedQuantity: string;
  demoThresholdNotes: string;
  moistureEstimate: string;
}

export interface DamageAssessmentAnalysis {
  id: string;
  timestamp: number;
  projectId?: string;
  technicianName?: string;
  executiveSummary: string;
  waterCategory: WaterCategory | string;
  waterCategoryJustification: string;
  waterLossClass: LossClass | string;
  lossClassJustification: string;
  estimatedSeverity: 'Minor' | 'Moderate' | 'Severe' | 'Critical' | 'Catastrophic';
  severityScore: number; // 1-100
  quantifiedMetrics: {
    totalAffectedSqFt: number;
    baseboardsLinearFt: number;
    drywallFloodCutLinearFt: number;
    recommendedFloodCutHeightInches: number;
    standingWaterDepthInches: number;
    estimatedGallonsToExtract: number;
  };
  affectedMaterials: AffectedMaterialAnalysis[];
  hazardAssessment: {
    electricalHazard: boolean;
    structuralCompromise: boolean;
    microbialRisk: 'Low' | 'Moderate' | 'High' | 'Immediate Abatement Required';
    biohazardPresent: boolean;
    recommendedPPE: string[];
    containmentRequired: boolean;
    containmentType: string;
  };
  recommendedEquipment: Array<{
    type: 'Air Mover' | 'LGR Dehumidifier' | 'Desiccant Dehumidifier' | 'HEPA Air Scrubber' | 'Extraction Unit' | 'Air Injection System';
    quantity: number;
    formulaCalculation: string;
    notes: string;
  }>;
  immediateActionProtocol: string[];
  lineItemsDraft: Array<{
    code: string;
    description: string;
    quantity: number;
    unit: string;
    category: string;
  }>;
  mediaFindings: Array<{
    mediaIndex: number;
    mediaLabel: string;
    damageIdentified: string;
    materialsDetected: string[];
    moistureSigns: string;
  }>;
  formattedReportMarkdown?: string;
}

export type Tab = 
    | 'dashboard' 
    | 'losses' 
    | 'downloads' 
    | 'alerts' 
    | 'more' 
    | 'new-loss' 
    | 'new-project' 
    | 'settings' 
    | 'time-clock'
    | 'loss-detail' 
    | 'project' 
    | 'line-items' 
    | 'tic-sheet' 
    | 'scanner' 
    | 'equipment'
    | 'photos'
    | 'mitigation-docs'
    | 'admin'
    | 'reporting'
    | 'billing'
    | 'smart-docs'
    | 'inventory'
    | 'crew-dispatch'
    | 'task-manager'
    | 'ar-mapping'
    | 'google-workspace'
    | 'doc-templates';

// ============================================================================
// Automated Water Mitigation Project Setup & Documentation Templates
// ============================================================================

export interface ClientIntakeForm {
  id: string;
  templateType: 'client_intake';
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'completed' | 'signed';
  // Pre-filled client & property info
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  propertyAddress: string;
  lossDate: string;
  intakeDate: string;
  // Pre-filled insurance details
  insuranceCarrier: string;
  policyNumber: string;
  claimNumber: string;
  adjusterName?: string;
  adjusterPhone?: string;
  adjusterEmail?: string;
  // Intake specifics
  waterCategory: WaterCategory;
  lossClass: LossClass;
  waterSourceDescription: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  occupancyStatus: 'Owner Occupied' | 'Tenant Occupied' | 'Vacant' | 'Commercial';
  propertyType: 'Single Family' | 'Multi-Family' | 'Condo' | 'Commercial' | 'Industrial';
  yearBuilt: string;
  pre1985Structure: boolean;
  waterTurnedOff: boolean;
  powerStatus: 'Active' | 'Shut Off at Main' | 'Partial / Tripped Breakers';
  specialAccessInstructions: string;
  technicianNotes: string;
  // Authorization & Sign-off
  workAuthorizationSigned: boolean;
  signatureDataUrl?: string;
  signedDate?: string;
  signedByName?: string;
}

export interface ScopeOutlineItem {
  id: string;
  category: 'Containment & Protection' | 'Water Extraction' | 'Controlled Demolition' | 'Antimicrobial & Cleaning' | 'Drying Equipment' | 'Monitoring & Verification';
  task: string;
  description: string;
  standardReference: string; // e.g. "IICRC S500 Sec 10.4", "IICRC S500 Sec 12.2"
  status: 'pending' | 'in_progress' | 'completed' | 'not_applicable';
  notes?: string;
  estimatedQuantity?: string;
}

export interface ProjectScopeOutline {
  id: string;
  templateType: 'scope_outline';
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'approved' | 'in_progress' | 'completed';
  // Pre-filled header
  clientName: string;
  propertyAddress: string;
  date: string;
  waterCategory: WaterCategory;
  lossClass: LossClass;
  // Technical parameters
  targetDryStandard: string;
  estimatedDryingDurationDays: number;
  containmentLevel: 'Source Containment' | 'Mini-Containment' | 'Full Critical Barrier with Negative Air' | 'None Required';
  dehumidifierCapacityTarget: string; // e.g. "110-140 AHAM pints/day (Class 2)"
  airMoverCountEstimated: number;
  hepaAirScrubberRequired: boolean;
  scopeItems: ScopeOutlineItem[];
  technicianSignOff?: {
    techName: string;
    date: string;
    signed: boolean;
  };
}

export interface DamageAssessmentChecklistItem {
  id: string;
  section: 'Source & Containment' | 'Health, Life & Safety' | 'Building Assemblies & Moisture' | 'HVAC & Airflow' | 'Contents & Valuables' | 'Environmental & Regulatory';
  item: string;
  description: string;
  status: 'pass' | 'fail' | 'action_required' | 'not_inspected';
  severity?: 'normal' | 'moderate' | 'critical';
  notes?: string;
  photoRef?: string;
}

export interface InitialDamageAssessmentChecklist {
  id: string;
  templateType: 'damage_assessment';
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'completed' | 'reviewed';
  // Pre-filled header
  clientName: string;
  propertyAddress: string;
  assessmentDate: string;
  inspectorName: string;
  waterCategory: WaterCategory;
  lossClass: LossClass;
  // Rapid assessment summary
  overallConditionRating: 'Minor' | 'Moderate' | 'Severe / Catastrophic';
  sourceIdentified: boolean;
  sourceDescription: string;
  standingWaterDepthInches: number;
  visibleMicrobialGrowth: boolean;
  microbialDescription?: string;
  structuralIntegrityCompromised: boolean;
  electricalHazardsPresent: boolean;
  checklistItems: DamageAssessmentChecklistItem[];
  summaryConclusion: string;
  recommendations: string[];
}

export interface ProjectDocumentationTemplates {
  autoGeneratedAt: string;
  clientIntake: ClientIntakeForm;
  scopeOutline: ProjectScopeOutline;
  damageAssessment: InitialDamageAssessmentChecklist;
}

// ============================================================================
// Smart Adaptive Mitigation Checklists & Digital Forms
// ============================================================================

export type MitigationProjectType = 
  | 'Residential - Single Family'
  | 'Residential - Multi-Family / Condo'
  | 'Commercial - Office / Corporate'
  | 'Commercial - Retail / Hospitality'
  | 'Commercial - Healthcare / Clinic'
  | 'Commercial - Institutional / School'
  | 'Industrial / Warehouse Facility';

export type MitigationLossSource = 
  | 'Clean Water Pipe Burst / Supply Line'
  | 'Appliance Failure / Overflow'
  | 'Groundwater Infiltration / Overland Flood'
  | 'Sewage Backup / Blackwater Backflow'
  | 'Roof Leak / Storm Intrusion'
  | 'Fire Sprinkler System Discharge'
  | 'Microbial / Mold Amplification';

export interface ChemicalTreatmentLog {
  id: string;
  productName: string;
  epaRegNumber: string;
  activeIngredient: string;
  applicationMethod: 'ULV Cold Fog' | 'Low-Pressure Coarse Spray' | 'Direct Surface Saturation' | 'Electrostatic Spray' | 'HEPA Wipe Down';
  targetAreas: string;
  dwellTimeMinutes: number;
  sqFtTreated: number;
  appliedBy: string;
  appliedAt: string;
  ppeUsed: string[];
  clientNotifiedOfReEntry: boolean;
  notes?: string;
}

export interface EquipmentDeployedLog {
  id: string;
  equipmentType: 'Air Mover (Axial/Centrifugal)' | 'LGR Dehumidifier' | 'Desiccant Dehumidifier' | 'HEPA Air Scrubber' | 'Injectidry Wall/Floor System' | 'Air Scrubber - Negative Air';
  model: string;
  serialNumber?: string;
  roomLocation: string;
  amperage: number;
  circuitVerified: boolean;
  targetRunHours: number;
  actualHours?: number;
  deployedDate: string;
  status: 'Running' | 'Standby' | 'Decontaminated & Removed';
}

export interface MoistureReadingEntry {
  id: string;
  roomName: string;
  materialName: string;
  readingType: 'Penetrating Pin' | 'Non-Destructive RF' | 'RH Probe' | 'Concrete In-Situ';
  dryGoalMC: number;
  baselineWetMC: number;
  currentMC: number;
  dateRecorded: string;
  isDry: boolean;
  locationDetails?: string;
}

export interface MitigationSOPStep {
  phase: string;
  standardRef: string;
  directive: string;
  criticalControlPoint: string;
  requiredPPE: string;
}

export interface MitigationSOPSummary {
  sopId: string;
  title: string;
  generatedAt: string;
  projectType: MitigationProjectType;
  lossSource: MitigationLossSource;
  waterCategory: WaterCategory;
  lossClass: LossClass;
  executiveDirective: string;
  containmentAndAirflowProtocol: string;
  demolitionAndSalvageThreshold: string;
  antimicrobialAndMoldProtocol: string;
  dryingTargetAndVerification: string;
  steps: MitigationSOPStep[];
}

export interface AdaptiveMitigationConfig {
  projectType: MitigationProjectType;
  lossSource: MitigationLossSource;
  waterCategory: WaterCategory;
  lossClass: LossClass;
  affectedSqFt: number;
  standingWaterDepthInches: number;
  moldIdentified: boolean;
  pre1985Structure: boolean;
  occupancyStatus: 'Owner Occupied' | 'Tenant Occupied' | 'Vacant' | 'Commercial Active Operations';
  containmentRequired: boolean;
  negativeAirRequired: boolean;
  powerSource: 'Grid Utility (Standard)' | 'Portable Generator' | 'Spider Box / Temporary Panel';
  // Key Job Metadata Fields
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  propertyAddress?: string;
  inspectionDate?: string;
  technicianName?: string;
  affectedAreas?: string[];
  materialsImpacted?: string[];
  equipmentUsed?: string[];
  completionSignOff?: {
    technicianName: string;
    technicianSignature?: string;
    clientName: string;
    clientSignature?: string;
    signedAt: string;
    notes?: string;
    auditHash?: string;
  };
  generatedSOP?: MitigationSOPSummary;
}

export interface SmartDigitalForm {
  id: string;
  formType: 
    | 'work_authorization' 
    | 'daily_mitigation_log'
    | 'chemical_treatment_disclosure' 
    | 'structural_demo_release' 
    | 'equipment_responsibility' 
    | 'certificate_of_satisfaction';
  title: string;
  subtitle: string;
  category: 'Legal & Authorization' | 'Field Compliance' | 'Safety & Chemicals' | 'Closeout';
  status: 'draft' | 'ready_for_signature' | 'signed' | 'archived';
  createdAt: string;
  updatedAt: string;
  data: {
    clientName: string;
    propertyAddress: string;
    claimNumber?: string;
    insuranceCarrier?: string;
    policyNumber?: string;
    technicianName: string;
    projectType: string;
    lossSource: string;
    waterCategory: string;
    lossClass: string;
    summaryNotes?: string;
    moistureReadingsSummary?: MoistureReadingEntry[];
    equipmentDeployedSummary?: EquipmentDeployedLog[];
    chemicalTreatmentsSummary?: ChemicalTreatmentLog[];
    customClauses?: { id: string; title: string; text: string; accepted: boolean }[];
    deductibleAmount?: string;
    emergencyRateApproved?: boolean;
    authorizedDollarLimit?: string;
    demoCutHeightInches?: number;
    containmentBarrierLevel?: string;
    wasteDisposalManifestVerified?: boolean;
  };
  technicianSignature?: {
    name: string;
    title: string;
    signatureDataUrl: string;
    signedAt: string;
    ipStamp?: string;
  };
  clientSignature?: {
    name: string;
    role: 'Property Owner' | 'Tenant' | 'Property Manager' | 'Authorized Representative';
    signatureDataUrl: string;
    signedAt: string;
    ipStamp?: string;
  };
}



