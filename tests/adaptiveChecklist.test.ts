import { describe, it, expect } from 'vitest';
import {
  deriveAdaptiveConfig,
  generateAdaptiveChecklistPhases,
  generateSummarySOP,
} from '../services/adaptiveMitigationEngine';
import { LossClass, Project, WaterCategory } from '../types';

const createMockProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'proj-test-101',
  companyId: 'comp-1',
  client: 'Apex Medical Clinic',
  address: '450 Healthcare Way, Suite 200',
  clientPhone: '555-0199',
  clientEmail: 'facilities@apexclinic.org',
  projectManager: 'Marcus Vance, WRT/AMRT',
  status: 'Active',
  currentStage: 'Stabilize',
  waterCategory: WaterCategory.CAT_2,
  lossClass: LossClass.CLASS_2,
  progress: 35,
  startDate: '2025-05-01',
  lastUpdated: '2025-05-02',
  insurance: 'Chubb Commercial',
  policyNumber: 'POL-99412',
  claimNumber: 'CLM-2025-882',
  adjuster: 'Elena Rostova',
  summary: 'Supply line rupture in sterilization corridor affecting 850 sq ft.',
  rooms: [
    {
      id: 'r-1',
      name: 'Exam Room A',
      dimensions: { sqft: 400, length: 20, width: 20, height: 9 },
      status: 'wet',
      readings: [],
      photos: [],
      materials: {
        flooring: 'Sheet Vinyl',
        wall: '5/8" Type X Drywall',
        trim: 'Rubber Cove Base',
      },
    },
    {
      id: 'r-2',
      name: 'Hallway / Corridor',
      dimensions: { sqft: 450, length: 45, width: 10, height: 9 },
      status: 'drying',
      readings: [],
      photos: [],
    },
  ],
  roomScans: [],
  videos: [],
  dailyNarratives: [],
  placedEquipment: [],
  overallReadings: [],
  trackedMaterials: [],
  lineItems: [],
  milestones: [],
  tasks: [],
  ...overrides,
});

describe('Adaptive Water Mitigation Checklist & Summary SOP Engine', () => {
  it('populates all key project fields (client info, date, technician, water category, affected areas, materials, equipment)', () => {
    const project = createMockProject();
    const config = deriveAdaptiveConfig(project);

    expect(config.clientName).toBe('Apex Medical Clinic');
    expect(config.propertyAddress).toBe('450 Healthcare Way, Suite 200');
    expect(config.technicianName).toBe('Marcus Vance, WRT/AMRT');
    expect(config.waterCategory).toBe(WaterCategory.CAT_2);
    expect(config.inspectionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(config.affectedAreas).toContain('Exam Room A');
    expect(config.affectedAreas).toContain('Hallway / Corridor');
    expect(config.materialsImpacted.length).toBeGreaterThan(0);
    expect(config.equipmentUsed.length).toBeGreaterThan(0);
    expect(config.generatedSOP).toBeDefined();
  });

  it('generates all 7 required adaptive checklist sections with tailored steps', () => {
    const project = createMockProject();
    const config = deriveAdaptiveConfig(project);
    const phases = generateAdaptiveChecklistPhases(config, project);

    expect(phases).toHaveLength(7);
    const phaseTitles = phases.map((p) => p.title);
    expect(phaseTitles[0]).toContain('Initial Inspection');
    expect(phaseTitles[1]).toContain('Containment');
    expect(phaseTitles[2]).toContain('Water Extraction');
    expect(phaseTitles[3]).toContain('Drying');
    expect(phaseTitles[4]).toContain('Dehumidification');
    expect(phaseTitles[5]).toContain('Mold Prevention');
    expect(phaseTitles[6]).toContain('Final Walkthrough');

    // Every phase must contain actionable checklist items
    phases.forEach((phase) => {
      expect(phase.items.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('adapts checklist and SOP dynamically for Category 3 sewage and Healthcare project types', () => {
    const project = createMockProject({
      waterCategory: WaterCategory.CAT_3,
      lossClass: LossClass.CLASS_3,
    });
    const baseConfig = deriveAdaptiveConfig(project);
    const healthcareConfig = {
      ...baseConfig,
      projectType: 'Commercial - Healthcare / Clinic' as const,
      waterCategory: WaterCategory.CAT_3,
      lossClass: LossClass.CLASS_3,
      pre1985Structure: true,
      moldIdentified: true,
    };

    const sop = generateSummarySOP(healthcareConfig);
    expect(sop.sopId).toContain('SOP-HC-ICRA');
    expect(sop.title).toContain('Commercial - Healthcare / Clinic');
    expect(sop.executiveDirective).toContain('ICRA Class IV');
    expect(sop.containmentAndAirflowProtocol).toContain('negative air pressure (-0.02 in. w.g.');
    expect(sop.demolitionAndSalvageThreshold).toContain('Category 3 Blackwater Non-Salvageable Mandate');
    expect(sop.demolitionAndSalvageThreshold).toContain('MANDATORY STOP: Collect ACM/Lead bulk samples');
    expect(sop.steps).toHaveLength(7);

    const phases = generateAdaptiveChecklistPhases(healthcareConfig, project);
    const containmentItems = phases[1].items.map((i) => `${i.label} ${i.standardRef || ''}`).join(' ');
    expect(containmentItems).toContain('Full Critical 6-Mil Poly Barrier with Negative Air Pressure (-0.02 in. w.g.)');
    expect(containmentItems).toContain('HEPA 500 CFM Air Scrubber');
  });
});
