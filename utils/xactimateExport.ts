/**
 * xactimateExport.ts
 *
 * Generates a XactXML-compatible export for a Restoration-AI project.
 * The output mirrors the structure of an Xactimate XACTDOC.xml estimate,
 * suitable for import as an ESX/XactXML file.
 *
 * Standard WTR water-mitigation line-item codes used:
 *   WTR 120  – Air mover (axial/centrifugal), per day
 *   WTR 130  – Dehumidifier, LGR, per day
 *   WTR 140  – Dehumidifier, conventional, per day
 *   WTR 150  – Air scrubber / HEPA filtration device, per day
 *   WTR 240  – Water mitigation technician, per hour
 *   WTR 252  – Apply antimicrobial agent, per SF
 *   WTR 300  – Extract water (carpet/hard floor), per SF
 *   WTR 502  – Remove wet / damaged drywall, per SF
 *   WTR 512  – Remove wet insulation, per SF
 */

import JSZip from 'jszip';
import { Project, PlacedEquipment, Room, WaterCategory, LossClass } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(value: string | number | undefined | null): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt2(n: number): string {
  return n.toFixed(2);
}

function isoDate(ts?: number | string): string {
  if (!ts) return new Date().toISOString().split('T')[0];
  if (typeof ts === 'number') return new Date(ts).toISOString().split('T')[0];
  return ts.split('T')[0];
}

// ---------------------------------------------------------------------------
// Equipment mapping to Xactimate codes
// ---------------------------------------------------------------------------

const EQUIPMENT_CODE_MAP: Record<PlacedEquipment['type'], string> = {
  'Air Mover':    'WTR 120',
  'Dehumidifier': 'WTR 130',
  'HEPA Scrubber':'WTR 150',
  'Heater':       'WTR 160',
};

const EQUIPMENT_DESCRIPTION_MAP: Record<PlacedEquipment['type'], string> = {
  'Air Mover':    'Air mover (axial / centrifugal) - per day',
  'Dehumidifier': 'Dehumidifier, LGR - per day',
  'HEPA Scrubber':'Air scrubber / HEPA filtration device - per day',
  'Heater':       'Supplemental heat unit - per day',
};

function isConventionalDhu(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes('desiccant') || lower.includes('conventional') || lower.includes('compact 20');
}

// ---------------------------------------------------------------------------
// Room area calculations
// ---------------------------------------------------------------------------

interface RoomAreas {
  floorSF: number;
  wallSF: number;
  ceilingSF: number;
  perimeterLF: number;
}

function calcRoomAreas(room: Room): RoomAreas {
  const { length = 0, width = 0, height = 0 } = room.dimensions;
  const floorSF    = length * width;
  const ceilingSF  = floorSF;
  const wallSF     = 2 * (length + width) * height;
  const perimeterLF = 2 * (length + width);
  return { floorSF, wallSF, ceilingSF, perimeterLF };
}

// ---------------------------------------------------------------------------
// Line item building
// ---------------------------------------------------------------------------

interface XactLineItem {
  id: string;
  roomName: string;
  category: string;
  selector: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

let _idCounter = 0;
function nextId(): string {
  return `LI-${String(++_idCounter).padStart(4, '0')}`;
}

function estimateDailyRate(type: PlacedEquipment['type'], model: string): number {
  const m = model.toLowerCase();
  if (type === 'Air Mover')    return m.includes('axial') || m.includes('stealth') ? 45 : 35;
  if (type === 'Dehumidifier') {
    if (m.includes('desiccant') || m.includes('1200') || m.includes('firebird')) return 150;
    return 110;
  }
  if (type === 'HEPA Scrubber') return m.includes('guardian') ? 150 : 85;
  if (type === 'Heater')        return 55;
  return 35;
}

function buildEquipmentLineItems(equipment: PlacedEquipment[]): XactLineItem[] {
  const grouped: Map<string, { item: PlacedEquipment; count: number; totalHours: number }> = new Map();

  for (const eq of equipment) {
    const key = `${eq.room}||${eq.type}||${eq.model}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count++;
      existing.totalHours += eq.hours || 0;
    } else {
      grouped.set(key, { item: eq, count: 1, totalHours: eq.hours || 0 });
    }
  }

  const lineItems: XactLineItem[] = [];

  for (const { item, count, totalHours } of grouped.values()) {
    const avgHours = count > 0 ? totalHours / count : 0;
    const days     = Math.max(1, Math.ceil(avgHours / 24));
    const quantity = count * days;

    let code = EQUIPMENT_CODE_MAP[item.type];
    let description = EQUIPMENT_DESCRIPTION_MAP[item.type];

    if (item.type === 'Dehumidifier' && isConventionalDhu(item.model)) {
      code = 'WTR 140';
      description = 'Dehumidifier, conventional - per day';
    }

    const unitCost = estimateDailyRate(item.type, item.model);

    lineItems.push({
      id: nextId(),
      roomName: item.room,
      category: 'WTR',
      selector: code.replace('WTR ', ''),
      code,
      description: `${description} [${item.model}] x${count} unit${count > 1 ? 's' : ''} x${days} day${days > 1 ? 's' : ''}`,
      quantity,
      unit: 'DA',
      unitCost,
      total: quantity * unitCost,
    });
  }

  return lineItems;
}

function buildRoomLineItems(rooms: Room[], waterCategory?: WaterCategory): XactLineItem[] {
  const items: XactLineItem[] = [];
  const isContaminated = waterCategory === WaterCategory.CAT_2 || waterCategory === WaterCategory.CAT_3;

  for (const room of rooms) {
    if (room.status === 'dry') continue;
    const { floorSF, wallSF } = calcRoomAreas(room);

    if (floorSF > 0) {
      items.push({
        id: nextId(),
        roomName: room.name,
        category: 'WTR',
        selector: '300',
        code: 'WTR 300',
        description: 'Extract water - per SF (floor)',
        quantity: floorSF,
        unit: 'SF',
        unitCost: 0.35,
        total: floorSF * 0.35,
      });
    }

    if (isContaminated && floorSF > 0) {
      items.push({
        id: nextId(),
        roomName: room.name,
        category: 'WTR',
        selector: '252',
        code: 'WTR 252',
        description: 'Apply antimicrobial agent - per SF',
        quantity: floorSF + wallSF,
        unit: 'SF',
        unitCost: 0.18,
        total: (floorSF + wallSF) * 0.18,
      });
    }
  }

  return items;
}

function estimateMaterialSF(location: string, rooms: Room[]): number {
  const locLower = location.toLowerCase();
  for (const room of rooms) {
    if (locLower.includes(room.name.toLowerCase())) {
      const { wallSF } = calcRoomAreas(room);
      return Math.round(wallSF * 0.5);
    }
  }
  return 40;
}

function buildDemoLineItems(project: Project): XactLineItem[] {
  const items: XactLineItem[] = [];
  const materials = project.dryingMonitor || [];

  for (const mat of materials) {
    if (mat.status === 'Dry') continue;
    const nameLower = mat.name.toLowerCase();
    const isInsulation = nameLower.includes('insul');
    const isDrywall    = nameLower.includes('drywall') || nameLower.includes('sheetrock') || nameLower.includes('gypsum');
    if (!isDrywall && !isInsulation) continue;

    const sfEstimate = estimateMaterialSF(mat.location, project.rooms);
    if (sfEstimate <= 0) continue;

    if (isInsulation) {
      items.push({
        id: nextId(),
        roomName: mat.location,
        category: 'WTR',
        selector: '512',
        code: 'WTR 512',
        description: `Remove wet insulation - ${mat.name} (${mat.location})`,
        quantity: sfEstimate,
        unit: 'SF',
        unitCost: 0.62,
        total: sfEstimate * 0.62,
      });
    } else {
      items.push({
        id: nextId(),
        roomName: mat.location,
        category: 'WTR',
        selector: '502',
        code: 'WTR 502',
        description: `Remove wet / damaged drywall - ${mat.name} (${mat.location})`,
        quantity: sfEstimate,
        unit: 'SF',
        unitCost: 0.55,
        total: sfEstimate * 0.55,
      });
    }
  }

  return items;
}

function buildLaborLineItem(equipment: PlacedEquipment[]): XactLineItem | null {
  if (equipment.length === 0) return null;
  const totalEquipHours = equipment.reduce((acc, e) => acc + (e.hours || 0), 0);
  const techHours = Math.max(2, Math.round(totalEquipHours / 4));

  return {
    id: nextId(),
    roomName: '',
    category: 'WTR',
    selector: '240',
    code: 'WTR 240',
    description: 'Water mitigation technician - labor, per hour',
    quantity: techHours,
    unit: 'HR',
    unitCost: 75.00,
    total: techHours * 75.00,
  };
}

// ---------------------------------------------------------------------------
// XML serialization
// ---------------------------------------------------------------------------

function serializeLineItem(li: XactLineItem): string {
  return `    <LineItem id="${esc(li.id)}">
      <Room>${esc(li.roomName)}</Room>
      <Category>${esc(li.category)}</Category>
      <Selector>${esc(li.selector)}</Selector>
      <Code>${esc(li.code)}</Code>
      <Description>${esc(li.description)}</Description>
      <Quantity>${fmt2(li.quantity)}</Quantity>
      <Unit>${esc(li.unit)}</Unit>
      <UnitCost>${fmt2(li.unitCost)}</UnitCost>
      <Total>${fmt2(li.total)}</Total>
    </LineItem>`;
}

function serializeRoom(room: Room): string {
  const { length, width, height } = room.dimensions;
  const { floorSF, wallSF, ceilingSF, perimeterLF } = calcRoomAreas(room);
  return `    <Room id="${esc(room.id)}">
      <Name>${esc(room.name)}</Name>
      <Length>${fmt2(length)}</Length>
      <Width>${fmt2(width)}</Width>
      <Height>${fmt2(height)}</Height>
      <FloorSF>${fmt2(floorSF)}</FloorSF>
      <WallSF>${fmt2(wallSF)}</WallSF>
      <CeilingSF>${fmt2(ceilingSF)}</CeilingSF>
      <PerimeterLF>${fmt2(perimeterLF)}</PerimeterLF>
      <Status>${esc(room.status)}</Status>
    </Room>`;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export interface XactimateExportResult {
  xml: string;
  filename: string;
  totalCost: number;
  lineItemCount: number;
}

export function generateXactimateXML(project: Project): XactimateExportResult {
  _idCounter = 0;

  const equipment = project.equipment || [];
  const rooms     = project.rooms     || [];

  const equipmentItems = buildEquipmentLineItems(equipment);
  const roomItems      = buildRoomLineItems(rooms, project.waterCategory);
  const demoItems      = buildDemoLineItems(project);
  const laborItem      = buildLaborLineItem(equipment);

  const existingItems: XactLineItem[] = (project.lineItems || []).map(li => ({
    id: nextId(),
    roomName: '',
    category: li.category || 'WTR',
    selector: (li.code || '').replace(/^WTR\s*/i, ''),
    code: li.code || '',
    description: li.description,
    quantity: li.quantity,
    unit: 'EA',
    unitCost: li.rate,
    total: li.total,
  }));

  const allLineItems: XactLineItem[] = [
    ...equipmentItems,
    ...roomItems,
    ...demoItems,
    ...(laborItem ? [laborItem] : []),
    ...existingItems,
  ];

  const grandTotal = allLineItems.reduce((s, li) => s + li.total, 0);

  const nameParts = (project.client || 'Unknown').split(' ');
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  const exportDate         = new Date().toISOString().split('T')[0];
  const lossDate           = isoDate(project.lossDate || project.startDate);
  const waterCategoryLabel = project.waterCategory || WaterCategory.CAT_1;
  const lossClassLabel     = project.lossClass     || LossClass.CLASS_1;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- XactXML Export generated by Restoration-AI on ${exportDate} -->
<!-- Compatible with Xactimate desktop import (XactXML format)  -->
<XactXML version="5.0" exportDate="${exportDate}" generator="Restoration-AI">

  <Header>
    <ClaimNumber>${esc(project.claimNumber || project.id)}</ClaimNumber>
    <PolicyNumber>${esc(project.policyNumber)}</PolicyNumber>
    <DateOfLoss>${lossDate}</DateOfLoss>
    <TypeOfLoss>Water Damage - ${esc(waterCategoryLabel)} / ${esc(lossClassLabel)}</TypeOfLoss>
    <ProjectStage>${esc(project.currentStage)}</ProjectStage>
    <ExportDate>${exportDate}</ExportDate>
    <ReferenceNumber>${esc(project.id)}</ReferenceNumber>
  </Header>

  <Insured>
    <FirstName>${esc(firstName)}</FirstName>
    <LastName>${esc(lastName)}</LastName>
    <FullName>${esc(project.client)}</FullName>
    <Address>${esc(project.address)}</Address>
    <Phone>${esc(project.clientPhone)}</Phone>
    <Email>${esc(project.clientEmail)}</Email>
  </Insured>

  <InsuranceInfo>
    <Company>${esc(project.insurance)}</Company>
    <ClaimNumber>${esc(project.claimNumber)}</ClaimNumber>
    <PolicyNumber>${esc(project.policyNumber)}</PolicyNumber>
    <AdjusterName>${esc(project.adjuster)}</AdjusterName>
    <AdjusterEmail>${esc(project.adjusterEmail)}</AdjusterEmail>
    <AdjusterPhone>${esc(project.adjusterPhone)}</AdjusterPhone>
  </InsuranceInfo>

  <Rooms count="${rooms.length}">
${rooms.map(serializeRoom).join('\n')}
  </Rooms>

  <Equipment count="${equipment.length}">
${equipment.map(eq => `    <Unit>
      <Type>${esc(eq.type)}</Type>
      <Model>${esc(eq.model)}</Model>
      <Room>${esc(eq.room)}</Room>
      <Status>${esc(eq.status)}</Status>
      <HoursLogged>${eq.hours || 0}</HoursLogged>
      <DaysCalculated>${Math.max(1, Math.ceil((eq.hours || 0) / 24))}</DaysCalculated>
    </Unit>`).join('\n')}
  </Equipment>

  <Scope totalLineItems="${allLineItems.length}" grandTotal="${fmt2(grandTotal)}">
${allLineItems.map(serializeLineItem).join('\n')}
  </Scope>

  <Summary>
    <TotalLineItems>${allLineItems.length}</TotalLineItems>
    <EquipmentLineItems>${equipmentItems.length}</EquipmentLineItems>
    <ExtractionLineItems>${roomItems.length}</ExtractionLineItems>
    <DemoLineItems>${demoItems.length}</DemoLineItems>
    <LaborLineItems>${laborItem ? 1 : 0}</LaborLineItems>
    <ExistingLineItems>${existingItems.length}</ExistingLineItems>
    <GrandTotal>${fmt2(grandTotal)}</GrandTotal>
  </Summary>

</XactXML>`;

  const safeJobNum = (project.claimNumber || project.id || 'job').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename   = `${safeJobNum}_xactimate.xml`;

  return { xml, filename, totalCost: grandTotal, lineItemCount: allLineItems.length };
}

/**
 * Downloads the estimate as a native Xactimate ESX file (ZIP archive containing
 * estimate.xml and manifest.xml). This is the preferred export format.
 */
export async function downloadESX(project: Project): Promise<XactimateExportResult> {
  const result = generateXactimateXML(project);
  const lossNumber = project.claimNumber || project.id || 'job';

  const zip = new JSZip();

  // Main estimate XML
  zip.file('estimate.xml', result.xml);

  // Manifest metadata
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<Manifest>
  <Version>2.0</Version>
  <Type>WaterMitigation</Type>
  <LossNumber>${esc(lossNumber)}</LossNumber>
  <CreatedBy>RestorationAI</CreatedBy>
</Manifest>`;
  zip.file('manifest.xml', manifest);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  const safeJobNum = lossNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = `${safeJobNum}_xactimate.esx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return result;
}

/**
 * @deprecated Use downloadESX() for native Xactimate ESX format.
 * Downloads the raw XactXML file (.xml). Kept as a plain-XML fallback.
 */
export function downloadXML(project: Project): XactimateExportResult {
  const result = generateXactimateXML(project);

  const blob = new Blob([result.xml], { type: 'application/xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return result;
}

/** @deprecated Alias for downloadXML — kept for backward compatibility. */
export const downloadXactimateXML = downloadXML;
