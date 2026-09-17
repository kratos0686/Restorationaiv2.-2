export interface MaterialItem {
  name: string;
  description: string;
  porosity: string;
  salvageability: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  description: string;
  items: MaterialItem[];
}

export const BUILDING_MATERIALS: MaterialCategory[] = [
  {
    id: 'flooring',
    name: 'Flooring & Subflooring',
    description: 'Flooring materials are critical to track because they dictate whether you can extract and dry in place, or if immediate demolition is required.',
    items: [
      { name: 'Carpet', description: '(Synthetic or Wool) Highly porous; salvageable in Category 1 water losses.', porosity: 'Highly porous', salvageability: 'High (Cat 1)' },
      { name: 'Carpet Pad', description: '(Rebond, Urethane, Rubber) Acts like a sponge; almost always removed in mitigation.', porosity: 'Highly porous', salvageability: 'Low' },
      { name: 'Hardwood (Solid)', description: 'Absorbs moisture slowly but will cup or crown; can often be saved with specialty drying (desiccants/mats).', porosity: 'Semi-porous', salvageability: 'Medium-High' },
      { name: 'Engineered Wood Flooring', description: 'Plywood base with a veneer top; more susceptible to delamination than solid wood.', porosity: 'Semi-porous', salvageability: 'Medium' },
      { name: 'Laminate Flooring', description: 'Composite wood base; highly susceptible to swelling and edge-swelling; rarely salvageable after standing water.', porosity: 'Semi-porous', salvageability: 'Low' },
      { name: 'LVP / LVT (Luxury Vinyl Plank/Tile)', description: 'Waterproof surface, but water can trap underneath, requiring removal to dry the subfloor.', porosity: 'Non-porous (Surface)', salvageability: 'Medium (Requires removal to dry subfloor)' },
      { name: 'VCT (Vinyl Composition Tile)', description: 'Common in commercial spaces; water can dissolve the adhesive holding it down.', porosity: 'Non-porous', salvageability: 'Medium' },
      { name: 'Ceramic / Porcelain Tile', description: 'Non-porous surface, but the grout and thinset below can trap moisture.', porosity: 'Non-porous', salvageability: 'High' },
      { name: 'Plywood Subfloor', description: 'Layers of wood veneer; takes longer to dry but usually salvageable.', porosity: 'Porous', salvageability: 'High' },
      { name: 'OSB (Oriented Strand Board) Subfloor', description: 'Compressed wood flakes; swells significantly on edges when wet; harder to dry than plywood.', porosity: 'Porous', salvageability: 'Medium' },
      { name: 'Concrete Slab', description: 'Highly porous; takes significant time and desiccant dehumidification to dry completely.', porosity: 'Highly porous', salvageability: 'High' }
    ]
  },
  {
    id: 'wall_ceiling',
    name: 'Wall & Ceiling Assemblies',
    description: 'Tracking these determines how much demolition (e.g., 2-foot flood cuts) needs to be recorded in the dry log.',
    items: [
      { name: 'Drywall / Gypsum Board / Sheetrock', description: 'Highly porous; loses structural integrity when wet; requires removal if insulated or in Category 2/3 losses.', porosity: 'Highly porous', salvageability: 'Low-Medium' },
      { name: 'Greenboard / Moisture-Resistant Drywall', description: 'Common in bathrooms; resists water better but will still fail if submerged.', porosity: 'Porous', salvageability: 'Low-Medium' },
      { name: 'Plaster and Lath', description: 'Older construction; very dense, difficult to penetrate with pin meters, and takes significantly longer to dry.', porosity: 'Semi-porous', salvageability: 'Medium-High' },
      { name: 'Wood Paneling', description: 'Solid wood or veneer over a composite core.', porosity: 'Semi-porous', salvageability: 'Medium' },
      { name: 'FRP (Fiberglass Reinforced Plastic)', description: 'Common in commercial kitchens/bathrooms; water can get trapped behind it.', porosity: 'Non-porous', salvageability: 'High (but traps water)' },
      { name: 'Acoustic Ceiling Tiles', description: '(Drop ceilings) Highly porous and prone to sagging/mold; almost always discarded when wet.', porosity: 'Highly porous', salvageability: 'Low' }
    ]
  },
  {
    id: 'structural',
    name: 'Structural Framing & Trim',
    description: 'These are the "bones" of the structure that you take your daily moisture meter readings on to reach your dry goal.',
    items: [
      { name: 'Dimensional Lumber', description: '(Pine, Fir, Spruce) Standard 2x4 framing; highly salvageable; standard dry goal is usually under 15-16% moisture content.', porosity: 'Porous', salvageability: 'High' },
      { name: 'MDF (Medium Density Fiberboard)', description: 'Commonly used for modern baseboards, casing, and cabinet boxes. It acts like a sponge, swells rapidly, loses all structural integrity, and is almost universally non-salvageable when wet.', porosity: 'Highly porous', salvageability: 'Low' },
      { name: 'Particle Board', description: 'Similar to MDF but coarser; used in cheap cabinetry and underlayment; swells and crumbles when wet.', porosity: 'Highly porous', salvageability: 'Low' },
      { name: 'Cinderblock / CMU (Concrete Masonry Unit)', description: 'Highly porous; often holds water inside the hollow cavities (weep holes may need to be drilled).', porosity: 'Highly porous', salvageability: 'High' }
    ]
  },
  {
    id: 'insulation',
    name: 'Insulation',
    description: 'Wet insulation loses its R-value (insulating property) and holds water against the framing, promoting mold.',
    items: [
      { name: 'Fiberglass Batt Insulation', description: 'Traps water and contaminants; standard practice is to remove and discard if wet.', porosity: 'Highly porous', salvageability: 'Low' },
      { name: 'Blown-in Cellulose', description: 'Made of recycled paper; turns into a heavy, soggy mush when wet; must be extracted.', porosity: 'Highly porous', salvageability: 'Low' },
      { name: 'EPS / XPS (Rigid Foam Board)', description: 'Closed-cell or open-cell; highly water-resistant, usually salvageable if cleaned.', porosity: 'Non-porous', salvageability: 'High' },
      { name: 'Spray Foam', description: 'Polyurethane base; closed-cell resists water, while open-cell absorbs it.', porosity: 'Varies', salvageability: 'Medium' }
    ]
  },
  {
    id: 'exterior',
    name: 'Exterior Envelope',
    description: 'Crucial for the "Leak Investigation" side of your app to document the source of the water intrusion.',
    items: [
      { name: 'Hardie Board / Fiber Cement Siding', description: 'Durable and water-resistant, but moisture can penetrate behind it if flashing fails.', porosity: 'Semi-porous', salvageability: 'High' },
      { name: 'Vinyl Siding', description: 'Waterproof, but allows water to pass behind it easily if not sealed correctly.', porosity: 'Non-porous', salvageability: 'High' },
      { name: 'Wood Siding / Shingles', description: '(Cedar, Redwood) Can warp or rot if the paint/sealant fails.', porosity: 'Porous', salvageability: 'Medium' },
      { name: 'Stucco / EIFS', description: 'Can absorb water and trap it against the exterior sheathing if weep screeds are blocked.', porosity: 'Porous', salvageability: 'Medium' },
      { name: 'Brick Veneer', description: 'Porous; requires a clear air gap and weep holes at the base to allow trapped water to escape.', porosity: 'Porous', salvageability: 'High' },
      { name: 'Housewrap', description: '(e.g., Tyvek) The water-resistive barrier (WRB) between the sheathing and the siding.', porosity: 'Non-porous', salvageability: 'High' }
    ]
  }
];
