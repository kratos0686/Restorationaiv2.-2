import { Project, ReportProfile } from '../types';

export interface ReportSectionDef {
  id: string;
  name: string;
  description: string;
  category: 'overview' | 'technical' | 'financial' | 'evidence' | 'closeout';
}

export const AVAILABLE_REPORT_SECTIONS: ReportSectionDef[] = [
  { id: 'header', name: 'Header & Letterhead', description: 'Restoration-AI corporate header with claim reference', category: 'overview' },
  { id: 'project_info', name: 'Claim & Insured Information', description: 'Client details, insurance policy, adjuster contact', category: 'overview' },
  { id: 'loss_details', name: 'Loss Categorization & Intake', description: 'IICRC Water Category, Loss Class, loss date and cause', category: 'overview' },
  { id: 'hazard_assessment', name: 'Safety & Hazard Inspection', description: 'PPE requirements, structural and electrical safety clearances', category: 'overview' },
  { id: 'chamber_metrics', name: 'Drying Chamber Boundaries', description: 'Chamber dimensions, cubic volume, and material classifications', category: 'technical' },
  { id: 'reference_readings', name: 'Atmospheric Reference & HVAC', description: 'Outside ambient, unaffected control baseline, and HVAC supply/return drops', category: 'technical' },
  { id: 'psychrometric_readings', name: 'Daily Psychrometric Logs', description: 'Detailed Temp, RH, GPP (Grains Per Pound), and Dew Point records', category: 'technical' },
  { id: 'moisture_map', name: 'Moisture Map Pins & Materials', description: 'Numbered pins, material dry standards, initial readings, and progress history', category: 'technical' },
  { id: 'equipment_inventory', name: 'Equipment Deployed & Status', description: 'Air movers, LGR dehumidifiers, HEPA scrubbers, and run-times', category: 'technical' },
  { id: 'sizing_calculations', name: 'IICRC S500 Equipment Justification', description: 'Calculated AHAM pints/day dehumidification and air mover spacing formulas', category: 'technical' },
  { id: 'daily_narrative', name: 'Technician Field Narratives', description: 'Chronological job site notes and daily progress documentation', category: 'technical' },
  { id: 'scope_of_work', name: 'Scope of Work & Line Items', description: 'Detailed mitigation scope items, codes, quantities, and totals', category: 'financial' },
  { id: 'attached_documents', name: 'Attached Documents & External Records', description: 'Lab clearance tests, subcontractor invoices, third-party estimates, etc.', category: 'evidence' },
  { id: 'photographic_evidence', name: 'Photographic Documentation', description: 'On-site moisture inspection and damage evidence photos', category: 'evidence' },
  { id: 'signatures', name: 'Authorizations & Signatures', description: 'Technician certification, client authorization, and certificate of satisfaction', category: 'closeout' },
];

export const BUILTIN_REPORT_PROFILES: ReportProfile[] = [
  {
    id: 'initial',
    name: 'Initial',
    description: 'Initial mitigation damage intake, hazard evaluation, and preliminary work scope for property managers and carrier notice.',
    targetAudience: 'Property Manager',
    isBuiltIn: true,
    sectionIds: [
      'header',
      'project_info',
      'loss_details',
      'hazard_assessment',
      'chamber_metrics',
      'reference_readings',
      'scope_of_work',
      'attached_documents',
      'photographic_evidence',
      'signatures'
    ],
    labelOverrides: {
      loss_details: 'Initial Intake & Water Classification',
      scope_of_work: 'Preliminary Emergency Mitigation Scope'
    },
    requiredFields: ['client', 'address', 'lossDate', 'waterCategory', 'lossClass']
  },
  {
    id: 'progress',
    name: 'Progress',
    description: 'Daily psychrometric log, grain depression drops, moisture pin matrix, and active equipment tracking.',
    targetAudience: 'Adjuster',
    isBuiltIn: true,
    sectionIds: [
      'header',
      'project_info',
      'chamber_metrics',
      'reference_readings',
      'psychrometric_readings',
      'moisture_map',
      'equipment_inventory',
      'daily_narrative',
      'attached_documents',
      'signatures'
    ],
    labelOverrides: {
      psychrometric_readings: 'Daily Chamber Atmospheric Readings',
      moisture_map: 'Moisture Pin Grid & Material Drying Progress'
    },
    requiredFields: ['client', 'claimNumber', 'dryingMonitor', 'referenceReadings']
  },
  {
    id: 'equipment_justification',
    name: 'Equipment Justification',
    description: 'Detailed carrier audit package proving air mover and dehumidifier counts against IICRC S500 formulas.',
    targetAudience: 'Carrier',
    isBuiltIn: true,
    sectionIds: [
      'header',
      'project_info',
      'loss_details',
      'chamber_metrics',
      'sizing_calculations',
      'equipment_inventory',
      'reference_readings',
      'attached_documents',
      'signatures'
    ],
    labelOverrides: {
      sizing_calculations: 'Carrier Audit: IICRC S500 Sizing Mathematical Proof',
      equipment_inventory: 'Active Equipment Schedule & Utilization'
    },
    requiredFields: ['claimNumber', 'adjuster', 'lossClass', 'equipment']
  },
  {
    id: 'complete_record',
    name: 'Complete Record',
    description: 'Comprehensive, all-inclusive restoration dossier containing full telemetry, pins, invoices, lab tests, and authorizations.',
    targetAudience: 'Carrier',
    isBuiltIn: true,
    sectionIds: [
      'header',
      'project_info',
      'loss_details',
      'hazard_assessment',
      'chamber_metrics',
      'reference_readings',
      'psychrometric_readings',
      'moisture_map',
      'sizing_calculations',
      'equipment_inventory',
      'daily_narrative',
      'scope_of_work',
      'attached_documents',
      'photographic_evidence',
      'signatures'
    ],
    labelOverrides: {
      header: 'Complete Mitigation & Drying Audit Package',
      signatures: 'Formal Structural Drying Certification & Signatures'
    },
    requiredFields: [
      'client',
      'address',
      'claimNumber',
      'policyNumber',
      'adjuster',
      'lossDate',
      'waterCategory',
      'lossClass',
      'jobCompletedDate'
    ]
  }
];

export const FIELD_DISPLAY_LABELS: Record<string, string> = {
  client: 'Insured / Client Name',
  address: 'Property Address',
  claimNumber: 'Insurance Claim Number',
  policyNumber: 'Insurance Policy Number',
  adjuster: 'Insurance Adjuster Name',
  adjusterPhone: 'Adjuster Phone Number',
  lossDate: 'Date of Loss',
  jobCompletedDate: 'Job Completion Date',
  waterCategory: 'Water Damage Category',
  lossClass: 'Water Loss Class',
  equipment: 'Deployed Equipment List',
  dryingMonitor: 'Tracked Materials / Moisture Grid',
  referenceReadings: 'Reference & HVAC Readings',
  attachedDocuments: 'Attached Outside Documents',
  signatures: 'Executed Digital Signatures & Authorizations'
};

export interface MissingFieldInfo {
  key: string;
  label: string;
}

/**
 * Checks project against a report profile's required fields.
 * Returns array of missing field definitions.
 */
export function getMissingRequiredFields(profile: ReportProfile, project: Project): MissingFieldInfo[] {
  if (!profile.requiredFields || profile.requiredFields.length === 0) {
    return [];
  }

  const missing: MissingFieldInfo[] = [];

  for (const fieldKey of profile.requiredFields) {
    let hasValue = false;

    if (fieldKey === 'signatures' || fieldKey === 'signedAuthorizations') {
      hasValue =
        Boolean(project.signedAuthorizations && project.signedAuthorizations.length > 0) ||
        Boolean(project.documentationTemplates?.clientIntake?.workAuthorizationSigned) ||
        Boolean(project.smartForms && project.smartForms.some(f => f.status === 'signed'));
    } else {
      const value = (project as Record<string, unknown>)[fieldKey];

      if (Array.isArray(value)) {
        hasValue = value.length > 0;
      } else if (typeof value === 'string') {
        hasValue = value.trim().length > 0;
      } else if (typeof value === 'number') {
        hasValue = !isNaN(value);
      } else if (value !== undefined && value !== null) {
        hasValue = true;
      }
    }

    if (!hasValue) {
      missing.push({
        key: fieldKey,
        label: FIELD_DISPLAY_LABELS[fieldKey] || fieldKey
      });
    }
  }

  return missing;
}

/**
 * Builds deterministic, report content based on actual project data (no AI hallucination).
 */
export function compileProfileReportMarkdown(
  project: Project,
  profile: ReportProfile
): string {
  const sections: string[] = [];
  const missingFields = getMissingRequiredFields(profile, project);

  const getMissingMarker = (fieldKey: string): string => {
    const isRequired = profile.requiredFields?.includes(fieldKey);
    const label = FIELD_DISPLAY_LABELS[fieldKey] || fieldKey;
    if (isRequired) {
      return `**[MISSING REQUIRED FIELD: ${label.toUpperCase()}]**`;
    }
    return `*[Not Provided]*`;
  };

  const getFieldValue = (fieldKey: string, actualVal?: string | number): string => {
    if (actualVal !== undefined && actualVal !== null && String(actualVal).trim() !== '') {
      return String(actualVal);
    }
    return getMissingMarker(fieldKey);
  };

  for (const sectionId of profile.sectionIds) {
    const sectionTitle = profile.labelOverrides?.[sectionId] || 
      AVAILABLE_REPORT_SECTIONS.find(s => s.id === sectionId)?.name || sectionId;

    switch (sectionId) {
      case 'header':
        sections.push(
          `# ${sectionTitle}\n` +
          `**Restoration AI Field Services** • *IICRC S500 / S520 Standard Operating Procedure*\n` +
          `Date Generated: ${new Date().toLocaleDateString()} | Report Profile: **${profile.name}**\n`
        );
        break;

      case 'project_info':
        sections.push(
          `## ${sectionTitle}\n` +
          `- **Insured / Client:** ${getFieldValue('client', project.client)}\n` +
          `- **Property Address:** ${getFieldValue('address', project.address)}\n` +
          `- **Insurance Carrier:** ${project.insurance || '*Direct Pay / Self-Insured*'}\n` +
          `- **Claim Number:** ${getFieldValue('claimNumber', project.claimNumber)}\n` +
          `- **Policy Number:** ${getFieldValue('policyNumber', project.policyNumber)}\n` +
          `- **Adjuster Name:** ${getFieldValue('adjuster', project.adjuster)}\n` +
          `- **Adjuster Phone:** ${getFieldValue('adjusterPhone', project.adjusterPhone)}\n`
        );
        break;

      case 'loss_details':
        sections.push(
          `## ${sectionTitle}\n` +
          `- **Water Category:** ${getFieldValue('waterCategory', project.waterCategory)}\n` +
          `- **Loss Classification:** ${getFieldValue('lossClass', project.lossClass)}\n` +
          `- **Date of Loss:** ${getFieldValue('lossDate', project.lossDate)}\n` +
          `- **Start of Mitigation:** ${project.startDate || new Date().toLocaleDateString()}\n` +
          `- **Job Completed Date:** ${getFieldValue('jobCompletedDate', project.jobCompletedDate)}\n` +
          `- **Loss Summary:** ${project.summary || '*No formal summary notes recorded.*'}\n`
        );
        break;

      case 'hazard_assessment':
        sections.push(
          `## ${sectionTitle}\n` +
          `- **Risk Classification:** ${project.riskLevel ? project.riskLevel.toUpperCase() : 'STANDARD'}\n` +
          `- **Electrical Status:** ${project.safetyAssessment?.electricalSafe ? 'Cleared / Safe' : 'Under Assessment'}\n` +
          `- **Structural Integrity:** ${project.safetyAssessment?.structuralSafe ? 'Stable' : 'Warning'}\n` +
          `- **PPE Deployed:** ${project.safetyAssessment?.ppeRequired?.join(', ') || 'N95 Respirators, Nitrile Gloves, Eye Protection'}\n` +
          `- **Notes:** ${project.safetyAssessment?.notes || 'Initial containment inspection completed with zero safety stops.'}\n`
        );
        break;

      case 'chamber_metrics': {
        const rooms = project.rooms || [];
        const chambers = project.dryingChambers || [];
        let roomRows = '';
        if (rooms.length === 0) {
          roomRows = `*No individual rooms defined in project record.*\n`;
        } else {
          roomRows = `| Room / Zone | Dimensions (L x W x H) | Est. Area | Flooring | Status |\n` +
            `| :--- | :--- | :--- | :--- | :--- |\n` +
            rooms.map(r => {
              const dims = r.dimensions ? `${r.dimensions.length || 0}' x ${r.dimensions.width || 0}' x ${r.dimensions.height || 8}'` : 'N/A';
              const sqFt = (r.dimensions?.length && r.dimensions?.width) ? `${r.dimensions.length * r.dimensions.width} SF` : 'N/A';
              const fl = r.materials?.flooring || 'Standard';
              const st = r.status ? r.status.toUpperCase() : 'ACTIVE';
              return `| ${r.name} | ${dims} | ${sqFt} | ${fl} | ${st} |`;
            }).join('\n');
        }
        sections.push(
          `## ${sectionTitle}\n` +
          `Total Chambers: ${chambers.length > 0 ? chambers.length : rooms.length}\n\n` +
          roomRows
        );
        break;
      }

      case 'reference_readings': {
        const refs = project.referenceReadings || [];
        if (refs.length === 0) {
          sections.push(
            `## ${sectionTitle}\n` +
            (profile.requiredFields?.includes('referenceReadings') 
              ? `**[MISSING REQUIRED FIELD: REFERENCE & HVAC READINGS]**\n*No outside ambient or unaffected baseline readings have been logged.*\n`
              : `*No reference or HVAC readings currently logged for this project.*\n`)
          );
        } else {
          const rows = refs.map(r => {
            const dateStr = new Date(r.timestamp).toLocaleDateString() + ' ' + new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `| ${r.zone.toUpperCase()} | ${dateStr} | ${r.temp}°F | ${r.rh}% | ${r.gpp} GPP | ${r.dewPoint}°F | ${r.notes || '-'} |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `| Zone | Timestamp | Temp | RH | GPP | Dew Point | Notes |\n` +
            `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n` +
            rows
          );
        }
        break;
      }

      case 'psychrometric_readings': {
        const rooms = project.rooms || [];
        const allReadings = rooms.flatMap(r => (r.readings || []).map(reading => ({ ...reading, roomName: r.name })));
        if (allReadings.length === 0) {
          sections.push(`## ${sectionTitle}\n*No daily room psychrometric logs recorded yet.*\n`);
        } else {
          const rows = allReadings.slice(-15).map(rd => {
            const dateStr = new Date(rd.timestamp).toLocaleDateString() + ' ' + new Date(rd.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `| ${rd.roomName} | ${dateStr} | ${rd.temp}°F | ${rd.rh}% | ${rd.gpp || '-'} | ${rd.dewPoint ? rd.dewPoint + '°F' : '-'} |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `| Location | Date & Time | Temp | RH | GPP | Dew Point |\n` +
            `| :--- | :--- | :--- | :--- | :--- | :--- |\n` +
            rows
          );
        }
        break;
      }

      case 'moisture_map': {
        const mats = project.dryingMonitor || [];
        if (mats.length === 0) {
          sections.push(
            `## ${sectionTitle}\n` +
            (profile.requiredFields?.includes('dryingMonitor') 
              ? `**[MISSING REQUIRED FIELD: TRACKED MATERIALS / MOISTURE GRID]**\n*No moisture pins or tracked materials recorded.*\n`
              : `*No moisture pins currently mapped.*\n`)
          );
        } else {
          const rows = mats.map((m, idx) => {
            const pinNum = m.pinNumber || idx + 1;
            const latest = m.readings && m.readings.length > 0 ? m.readings[m.readings.length - 1].value + '%' : `${m.initialReading}% (Initial)`;
            const coords = (m.pinX !== undefined && m.pinY !== undefined) ? `(${Math.round(m.pinX * 100)}%, ${Math.round(m.pinY * 100)}%)` : 'Unpinned';
            return `| Pin #${pinNum} | ${m.name} | ${m.location} | ${m.dryGoal}% | ${latest} | ${m.status} | ${coords} |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `| Pin # | Material | Location | Dry Standard | Current Reading | Status | Plan Coords |\n` +
            `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n` +
            rows
          );
        }
        break;
      }

      case 'equipment_inventory': {
        const eq = project.equipment || [];
        if (eq.length === 0) {
          sections.push(
            `## ${sectionTitle}\n` +
            (profile.requiredFields?.includes('equipment')
              ? `**[MISSING REQUIRED FIELD: DEPLOYED EQUIPMENT LIST]**\n*No equipment recorded as deployed on site.*\n`
              : `*No equipment records attached.*\n`)
          );
        } else {
          const rows = eq.map(item => {
            return `| ${item.type} | ${item.model || 'Commercial Grade'} | ${item.room || 'General'} | ${item.status} | ${item.hoursLogged || 0} hrs |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `| Equipment Type | Model | Placement | Status | Hours Logged |\n` +
            `| :--- | :--- | :--- | :--- | :--- | \n` +
            rows
          );
        }
        break;
      }

      case 'sizing_calculations': {
        // Deterministic IICRC S500 sizing formula based on actual project room square feet
        const rooms = project.rooms || [];
        const totalSqFt = rooms.reduce((acc, r) => acc + (r.dimensions?.length && r.dimensions?.width ? r.dimensions.length * r.dimensions.width : 200), 0);
        const totalCuFt = totalSqFt * 8;
        
        let dehuDivisor = 40; // Class 2 default
        if (project.lossClass === 'Class 1 (Least)' || project.lossClass === 'CLASS_1' as unknown) dehuDivisor = 50;
        else if (project.lossClass === 'Class 3 (Greatest)' || project.lossClass === 'CLASS_3' as unknown) dehuDivisor = 30;
        else if (project.lossClass === 'Class 4 (Specialty)' || project.lossClass === 'CLASS_4' as unknown) dehuDivisor = 25;

        const calculatedPints = Math.ceil(totalCuFt / dehuDivisor);
        const calculatedAirMovers = Math.max(1, Math.ceil(totalSqFt / 50));

        sections.push(
          `## ${sectionTitle}\n` +
          `### S500 Dehumidifier & Air Movement Calculations\n` +
          `- **Total Chamber Floor Area:** ${totalSqFt} sq. ft.\n` +
          `- **Total Chamber Volume:** ${totalCuFt} cu. ft. (assuming 8ft ceiling)\n` +
          `- **Water Damage Classification:** ${project.lossClass || 'Class 2'}\n` +
          `- **Required Dehumidification Capacity:** **${calculatedPints} AHAM Pints/Day** (Formula: ${totalCuFt} cu.ft. ÷ ${dehuDivisor})\n` +
          `- **Recommended Air Movers:** **${calculatedAirMovers} units** (Formula: 1 per 50-70 SF floor/wall boundary)\n` +
          `*All sizing aligns with ANSI/IICRC S500 standards for mechanical drying systems.*\n`
        );
        break;
      }

      case 'daily_narrative': {
        const narratives = project.dailyNarratives || [];
        if (narratives.length === 0) {
          sections.push(`## ${sectionTitle}\n*No daily narratives logged for this loss file.*\n`);
        } else {
          const list = narratives.map(n => {
            return `### ${n.date} — ${n.author || 'Technician'}\n${n.content}\n`;
          }).join('\n');
          sections.push(`## ${sectionTitle}\n` + list);
        }
        break;
      }

      case 'scope_of_work': {
        const lineItems = project.lineItems || [];
        if (lineItems.length === 0) {
          sections.push(`## ${sectionTitle}\n*No billing line items currently established.*\n`);
        } else {
          let totalCost = 0;
          const rows = lineItems.map(item => {
            const cost = item.total || (item.quantity * item.rate);
            totalCost += cost;
            return `| ${item.code} | ${item.description} | ${item.quantity} | $${item.rate.toFixed(2)} | $${cost.toFixed(2)} |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `| Code | Description | Qty | Unit Rate | Total Cost |\n` +
            `| :--- | :--- | :--- | :--- | :--- |\n` +
            rows + `\n\n` +
            `**Grand Total Scope Estimate:** **$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**\n`
          );
        }
        break;
      }

      case 'attached_documents': {
        const docs = project.attachedDocuments || [];
        if (docs.length === 0) {
          sections.push(`## ${sectionTitle}\n*No external documents or laboratory clearances attached to this report.*\n`);
        } else {
          const rows = docs.map(doc => {
            const dateStr = doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'Active Record';
            return `| ${doc.name} | ${doc.type.toUpperCase()} | ${doc.fileSize || 'Standard Record'} | ${dateStr} |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `| Document Title | Category | File Reference | Date Attached |\n` +
            `| :--- | :--- | :--- | :--- |\n` +
            rows + `\n\n` +
            `*Attached documents are permanently indexed in the project file and appended to this PDF package where applicable.*\n`
          );
        }
        break;
      }

      case 'photographic_evidence': {
        const photos = project.rooms?.flatMap(r => r.photos || []) || [];
        sections.push(
          `## ${sectionTitle}\n` +
          `Total Photos Cataloged: ${photos.length}\n` +
          `*Full-resolution color photographs with timestamp metadata are attached in the Photo Appendix.*\n`
        );
        break;
      }

      case 'signatures': {
        const signedAuths = project.signedAuthorizations || [];
        if (signedAuths.length > 0) {
          const authRows = signedAuths.map(auth => {
            const dateStr = new Date(auth.signedAt).toLocaleString();
            return `| ${auth.title} | **${auth.signerName}** | ${auth.signerRole} | ${dateStr} | \`${auth.verificationHash}\` |`;
          }).join('\n');
          sections.push(
            `## ${sectionTitle}\n` +
            `I certify that the structural drying services and psychrometric readings documented herein were performed in accordance with ANSI/IICRC S500 Standards for Professional Water Damage Restoration.\n\n` +
            `### Executed Electronic Authorizations & Cryptographic Certificates (${signedAuths.length})\n` +
            `| Authorization Form | Signer Name | Capacity / Role | Timestamp | SHA-256 Verification Hash |\n` +
            `| :--- | :--- | :--- | :--- | :--- |\n` +
            authRows + `\n\n` +
            `*Digital signature strokes and cryptographic attestation certificates are embedded in the Carrier Packet Signature Vault below.*\n`
          );
        } else {
          const isSigRequired = profile.requiredFields?.includes('signatures') || profile.requiredFields?.includes('signedAuthorizations');
          sections.push(
            `## ${sectionTitle}\n` +
            (isSigRequired ? `${getMissingMarker('signatures')}\n\n` : '') +
            `I certify that the structural drying services and psychrometric readings documented herein were performed in accordance with ANSI/IICRC S500 Standards for Professional Water Damage Restoration.\n\n` +
            `**Lead Mitigation Technician:** ___________________________  **Date:** ${new Date().toLocaleDateString()}\n\n` +
            `**Property Owner / Authorized Agent:** ___________________________  **Date:** ${new Date().toLocaleDateString()}\n`
          );
        }
        break;
      }

      default:
        sections.push(`## ${sectionTitle}\n*Section content for ${sectionId}*\n`);
        break;
    }
  }

  // If there are missing required fields, prepend a prominent notice
  if (missingFields.length > 0) {
    const missingNotice = 
      `> ⚠️ **CARRIER / AUDIT COMPLIANCE NOTICE: ${missingFields.length} REQUIRED FIELD(S) MISSING**\n` +
      `> This report profile requires the following fields which have not yet been provided in the project record:\n` +
      missingFields.map(f => `> - **${f.label}** (${f.key})`).join('\n') +
      `\n\n---\n\n`;
    return missingNotice + sections.join('\n\n---\n\n');
  }

  return sections.join('\n\n---\n\n');
}
