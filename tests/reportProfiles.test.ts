import { describe, it, expect, beforeEach } from 'vitest';
import { 
  BUILTIN_REPORT_PROFILES, 
  getMissingRequiredFields, 
  compileProfileReportMarkdown
} from '../utils/reportProfiles';
import { generateXactimateXML } from '../utils/xactimateExport';
import {
  BackgroundSyncService,
  computeSignatureVerificationHash,
  classifyProjectOperation
} from '../services/SyncService';
import { Project, ReportProfile } from '../types';

describe('Feature 3 & 4: Carrier & Property-Manager Profiles and Attached Documents', () => {
  const mockProject: Project = {
    id: 'proj-101',
    companyId: 'comp-1',
    name: 'Smith Residence Water Mitigation',
    client: 'John Smith',
    address: '456 Elm St, Austin, TX',
    claimNumber: 'CLM-987654',
    policyNumber: 'POL-112233',
    adjuster: 'Sarah Jenkins',
    adjusterPhone: '512-555-0199',
    waterCategory: 'CAT_2' as unknown as Project['waterCategory'],
    lossClass: 'Class 2' as unknown as Project['lossClass'],
    lossDate: '2026-10-10',
    jobCompletedDate: '2026-10-14',
    currentStage: 'Stabilize',
    rooms: [
      {
        id: 'room-1',
        name: 'Master Bedroom',
        dimensions: { length: 15, width: 20, height: 8 },
        materials: { flooring: 'Carpet on Pad' },
        readings: [
          { timestamp: 1728600000000, temp: 75, rh: 65, gpp: 85, dewPoint: 62 }
        ],
        photos: []
      }
    ],
    equipment: [
      {
        id: 'eq-1',
        type: 'Dehumidifier',
        model: 'Dri-Eaz LGR 7000XLi',
        room: 'Master Bedroom',
        status: 'Active',
        hoursLogged: 48,
        placedAt: 1728600000000
      },
      {
        id: 'eq-2',
        type: 'Air Mover',
        model: 'Stealth AV3000',
        room: 'Master Bedroom',
        status: 'Active',
        hoursLogged: 48,
        placedAt: 1728600000000
      }
    ],
    referenceReadings: [
      {
        zone: 'outside',
        temp: 82,
        rh: 55,
        gpp: 89,
        dewPoint: 64,
        timestamp: 1728600000000,
        notes: 'Outside ambient reference'
      },
      {
        zone: 'unaffected',
        temp: 72,
        rh: 42,
        gpp: 48,
        dewPoint: 47,
        timestamp: 1728600000000,
        notes: 'Unaffected office baseline'
      }
    ],
    dryingMonitor: [
      {
        id: 'mat-1',
        name: 'Drywall South Wall',
        type: 'Drywall',
        location: 'Master Bedroom',
        dryGoal: 12,
        initialReading: 45,
        pinNumber: 1,
        pinX: 0.25,
        pinY: 0.60,
        status: 'Wet',
        readings: [{ timestamp: 1728600000000, date: '10/11', value: 30 }]
      }
    ],
    attachedDocuments: [
      {
        id: 'doc-1',
        name: 'Spore Trap Air Quality Clearance Test',
        type: 'lab results',
        fileReference: 'data:image/png;base64,mockbase64',
        fileSize: '420 KB',
        uploadedAt: 1728600000000,
        notes: 'Passed clearance with normal fungal ecology.'
      },
      {
        id: 'doc-2',
        name: 'Emergency Plumbing Subcontractor Invoice',
        type: 'invoices',
        fileReference: 'ref-invoice-001',
        fileSize: '180 KB',
        uploadedAt: 1728600000000,
        notes: 'Slab leak pipe repair by Austin Master Plumbing.'
      }
    ]
  };

  it('provides the 4 built-in profiles: Initial, Progress, Equipment Justification, and Complete Record', () => {
    const profileIds = BUILTIN_REPORT_PROFILES.map(p => p.id);
    expect(profileIds).toContain('initial');
    expect(profileIds).toContain('progress');
    expect(profileIds).toContain('equipment_justification');
    expect(profileIds).toContain('complete_record');
  });

  it('detects missing required fields and returns descriptive labels', () => {
    const incompleteProject: Project = {
      id: 'proj-empty',
      companyId: 'comp-1',
      name: 'Empty Loss',
      currentStage: 'Intake'
    };

    const initialProfile = BUILTIN_REPORT_PROFILES.find(p => p.id === 'initial')!;
    const missing = getMissingRequiredFields(initialProfile, incompleteProject);

    expect(missing.length).toBeGreaterThan(0);
    const missingKeys = missing.map(m => m.key);
    expect(missingKeys).toContain('client');
    expect(missingKeys).toContain('address');
    expect(missingKeys).toContain('waterCategory');
  });

  it('visibly marks missing required fields in report markdown without silently filling them', () => {
    const incompleteProject: Project = {
      id: 'proj-empty',
      companyId: 'comp-1',
      name: 'Empty Loss',
      currentStage: 'Intake'
    };

    const initialProfile = BUILTIN_REPORT_PROFILES.find(p => p.id === 'initial')!;
    const markdown = compileProfileReportMarkdown(incompleteProject, initialProfile);

    // Prompt rule: "Missing required fields must show as a visible "missing" marker, never silently filled."
    expect(markdown).toContain('[MISSING REQUIRED FIELD:');
    expect(markdown).toContain('CARRIER / AUDIT COMPLIANCE NOTICE');
  });

  it('compiles report with real project numbers (readings, equipment, sizing, rooms) and attached documents', () => {
    const completeProfile = BUILTIN_REPORT_PROFILES.find(p => p.id === 'complete_record')!;
    const markdown = compileProfileReportMarkdown(mockProject, completeProfile);

    // Verify real project data
    expect(markdown).toContain('John Smith');
    expect(markdown).toContain('456 Elm St, Austin, TX');
    expect(markdown).toContain('CLM-987654');
    expect(markdown).toContain('Master Bedroom');
    expect(markdown).toContain('Dri-Eaz LGR 7000XLi');
    expect(markdown).toContain('82°F'); // Outside temp
    expect(markdown).toContain('89 GPP'); // Outside GPP
    expect(markdown).toContain('Spore Trap Air Quality Clearance Test'); // Attached document
    expect(markdown).toContain('Emergency Plumbing Subcontractor Invoice'); // Attached document
    expect(markdown).toContain('AHAM Pints/Day'); // Sizing calculation
  });

  it('supports custom profiles with custom section ordering and label overrides', () => {
    const customProfile: ReportProfile = {
      id: 'custom-property-mgr',
      name: 'Executive Landlord Summary',
      targetAudience: 'Property Manager',
      sectionIds: ['header', 'project_info', 'attached_documents', 'signatures'],
      labelOverrides: {
        attached_documents: 'Laboratory & Contractor Invoices Appendix'
      },
      requiredFields: ['client', 'address']
    };

    const markdown = compileProfileReportMarkdown(mockProject, customProfile);

    expect(markdown).toContain('Executive Landlord Summary');
    expect(markdown).toContain('Laboratory & Contractor Invoices Appendix');
    // Does not include sections not in custom sectionIds
    expect(markdown).not.toContain('Daily Chamber Atmospheric Readings');
  });

  it('persists attached documents and reference readings into Xactimate XML export', () => {
    const result = generateXactimateXML(mockProject);

    expect(result.xml).toContain('<ReferenceReadings count="2">');
    expect(result.xml).toContain('<Zone>outside</Zone>');
    expect(result.xml).toContain('<GPP>89</GPP>');
    expect(result.xml).toContain('<AttachedDocuments count="2">');
    expect(result.xml).toContain('<Name>Spore Trap Air Quality Clearance Test</Name>');
    expect(result.xml).toContain('<Type>lab results</Type>');
  });

  it('generates deterministic SHA-256 verification hash and embeds signed authorizations into reports and XML', () => {
    const ts = 1728650000000;
    const hash1 = computeSignatureVerificationHash(mockProject, 'John Smith', 'work_authorization', ts);
    const hash2 = computeSignatureVerificationHash(mockProject, 'John Smith', 'work_authorization', ts);
    const hashDifferentSigner = computeSignatureVerificationHash(mockProject, 'Jane Doe', 'work_authorization', ts);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^SHA256-[0-9A-F]{8}-[0-9A-F]{8}-[0-9A-F]{8}$/);
    expect(hash1).not.toBe(hashDifferentSigner);

    const projectWithSig: Project = {
      ...mockProject,
      signedAuthorizations: [
        {
          id: 'sig-001',
          formType: 'work_authorization',
          title: 'Work Authorization & Direction to Pay',
          signerName: 'John Smith',
          signerRole: 'Homeowner',
          signatureDataUrl: 'data:image/png;base64,sigdata',
          signedAt: ts,
          verificationHash: hash1,
          clausesAccepted: ['Authorized IICRC S500 mitigation']
        }
      ]
    };

    const completeProfile = BUILTIN_REPORT_PROFILES.find(p => p.id === 'complete_record')!;
    const markdown = compileProfileReportMarkdown(projectWithSig, completeProfile);
    expect(markdown).toContain('Executed Electronic Authorizations & Cryptographic Certificates');
    expect(markdown).toContain(hash1);
    expect(markdown).toContain('Work Authorization & Direction to Pay');

    const xmlResult = generateXactimateXML(projectWithSig);
    expect(xmlResult.xml).toContain('<SignedAuthorizations count="1">');
    expect(xmlResult.xml).toContain(`<VerificationHash>${hash1}</VerificationHash>`);
  });

  describe('Offline-First Local Dossier Store & Outbox Sync Queue', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('commits updates to local dossier store and classifies outbox mutations accurately', () => {
      BackgroundSyncService.setSimulatedOffline(true);
      expect(BackgroundSyncService.isEffectivelyOnline()).toBe(false);

      const saved = BackgroundSyncService.commitLocalProjectUpdate(
        mockProject.id,
        { moisturePins: [{ id: 'pin-1', pinNumber: 1, materialId: 'mat-1', x: 0.5, y: 0.5 }] },
        mockProject
      );
      expect(saved?.moisturePins?.length).toBe(1);

      const mut = BackgroundSyncService.enqueueOutboxMutation(mockProject.id, {
        moisturePins: saved?.moisturePins
      });
      expect(mut.operation).toBe('UPDATE_PINS');
      expect(mut.status).toBe('pending');
      expect(BackgroundSyncService.getPendingOutboxCount()).toBe(1);

      const sigClassification = classifyProjectOperation({ signedAuthorizations: [] });
      expect(sigClassification.operation).toBe('ADD_SIGNATURE');
    });
  });
});

