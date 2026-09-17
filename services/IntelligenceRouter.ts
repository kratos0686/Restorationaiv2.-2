
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { trackGeminiCall, CallContext } from "./geminiUsage";

export type TaskComplexity = 
  | 'FAST_ANALYSIS'      
  | 'DEEP_REASONING'     
  | 'VISION_ANALYSIS'    
  | 'CREATIVE_EDIT'      
  | 'VIDEO_GENERATION'   
  | 'LOCATION_SERVICES'; 

interface RouterConfig {
  systemInstruction?: string;
  responseMimeType?: string;
  responseSchema?: unknown;
  tools?: unknown[];
  imageConfig?: unknown;
  toolConfig?: unknown;
  thinkingBudget?: number;
}

export class IntelligenceRouter {
  private ai: GoogleGenAI;
  private ctx: CallContext;

  constructor(ctx?: { customerId: string; jobId: string }) {
    this.ctx = { customerId: ctx?.customerId || "unknown", jobId: ctx?.jobId || "unknown", step: "unknown", model: "unknown" };
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  private pickBestModel(complexity: TaskComplexity): string {
    switch (complexity) {
      case 'FAST_ANALYSIS': return 'gemini-3-flash-preview';
      case 'DEEP_REASONING': return 'gemini-3-pro-preview';
      case 'VISION_ANALYSIS': return 'gemini-3-pro-image-preview';
      case 'CREATIVE_EDIT': return 'gemini-2.5-flash-image';
      case 'VIDEO_GENERATION': return 'veo-3.1-fast-generate-preview';
      case 'LOCATION_SERVICES': return 'gemini-2.5-flash'; 
      default: return 'gemini-3-flash-preview';
    }
  }

  async execute(complexity: TaskComplexity, contents: unknown, config: RouterConfig = {}): Promise<GenerateContentResponse> {
    const model = this.pickBestModel(complexity);
    
    if (complexity === 'VIDEO_GENERATION') {
        throw new Error("Video generation requires specific operation handling via generateVideo method.");
    }

    const generationConfig: Record<string, unknown> = {
        systemInstruction: config.systemInstruction,
        responseMimeType: config.responseMimeType,
        responseSchema: config.responseSchema,
        tools: config.tools,
        toolConfig: config.toolConfig,
        imageConfig: config.imageConfig,
    };

    if (config.thinkingBudget && (model === 'gemini-3-pro-preview' || model === 'gemini-3-pro-image-preview')) {
        generationConfig.thinkingConfig = { thinkingBudget: config.thinkingBudget };
    }
    
    this.ctx.model = model;
    this.ctx.step = complexity;
    return await trackGeminiCall(this.ctx, () => this.ai.models.generateContent({
      model,
      contents: typeof contents === 'string' ? { parts: [{ text: contents }] } : contents,
      config: generationConfig
    }));
  }

  async parseFieldIntent(userInput: string, projectContext: unknown): Promise<GenerateContentResponse> {
      return await this.execute('FAST_ANALYSIS', 
        `You are a restoration AI assistant. Analyze this field technician's input: "${userInput}". 
         Context: ${JSON.stringify(projectContext)}.
         Categorize the input into: 'Psychrometrics', 'Equipment', 'Safety', or 'General'.
         Extract structured data if possible (e.g. temp, rh, count).
         Provide a clean, professional summary sentence.`,
        {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    category: { type: Type.STRING, enum: ['Psychrometrics', 'Equipment', 'Safety', 'General'] },
                    structuredData: { type: Type.OBJECT, description: "Any extracted numbers or entities" },
                    summary: { type: Type.STRING, description: "A polished log entry string" },
                    action: { type: Type.STRING, description: "Suggested system action ID if applicable" }
                }
            }
        }
      );
  }

  async generateScope(projectContext: string): Promise<GenerateContentResponse> {
    return await this.execute('DEEP_REASONING', 
        `Generate a professional mitigation scope (Xactimate style) based on this data: ${projectContext}. 
        You must include appropriate line items for Water Extraction, Demolition (e.g. drywall, flooring), and Equipment Setup/Monitoring (e.g. air movers, dehumidifiers) based on typical project requirements for the given Category and Class.
        Return an array of line items with: code, description, quantity, unit (LF, SF, EA), and rate.`,
        {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    lineItems: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                code: { type: Type.STRING },
                                description: { type: Type.STRING },
                                quantity: { type: Type.NUMBER },
                                unit: { type: Type.STRING },
                                rate: { type: Type.NUMBER }
                            },
                            required: ['code', 'description', 'quantity', 'unit', 'rate']
                        }
                    },
                    justification: { type: Type.STRING }
                }
            }
        }
    );
  }

  async generateTasks(projectContext: string): Promise<GenerateContentResponse> {
    return await this.execute('DEEP_REASONING', 
        `Based on the following restoration project details, auto-generate a comprehensive list of recommended tasks strictly adhering to IICRC S500 (Water) and IICRC S520 (Mold) standard requirements per room and per material listed. 
        Context: ${projectContext}
        Ensure tasks cover material removal, equipment recommendations, containment (if needed), and daily dry logging requirements. For each overall task, identify 2 to 5 specific, actionable compliance checklist subtasks or verification steps (e.g. particular items from S500/S520 guidance).
        Return the tasks as a JSON array of objects, where each object has a 'text' (string), a 'priority' (string: 'high', 'medium', or 'low'), and 'subtasks' (an array of strings).`,
        {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        priority: { type: Type.STRING },
                        subtasks: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ["text", "priority", "subtasks"]
                }
            }
        }
    );
  }

  async generateDailyDryingNarrative(context: { date?: string; psychrometricReadings?: unknown[]; trackedMaterials?: unknown[] }): Promise<GenerateContentResponse> {
    const prompt = `Act as a professional IICRC-certified Water Mitigation Technician. 
    Write a formal Daily Drying Narrative based on the following psychrometric readings and material status logs.
    
    DATA SOURCE:
    - Date: ${context.date || new Date().toLocaleDateString()}
    - Psychrometric Readings: ${JSON.stringify(context.psychrometricReadings || [])}
    - Tracked Materials & Status: ${JSON.stringify(context.trackedMaterials || [])}
    
    INSTRUCTIONS:
    - Write an analytical summary of the drying progress.
    - Mention significant changes in temperature, relative humidity, or GPP.
    - Highlight material moisture content trends (e.g., reaching dry goals or remaining wet).
    - Note any materials that were removed or changed status.
    - Keep it under 150 words.
    - Use professional, objective language suitable for an insurance claim file.
    - ALL field reports MUST be wrapped in markdown code blocks (\`\`\`).
    - Use plain-text dashes (-) for individual sentences/bullet points to prevent markdown parsers from converting them into standard HTML lists.`;

    return await this.execute('DEEP_REASONING', prompt);
  }

  async generateNarrative(context: { currentStage: string; equipment?: unknown[]; readings?: unknown[]; newPhotosCount?: number; complianceIssues?: string }): Promise<GenerateContentResponse> {
    const prompt = `Act as a professional IICRC-certified Water Mitigation Technician. Write a formal Daily Project Log based on the following data.
    
    DATA SOURCE:
    - Date: ${new Date().toLocaleDateString()}
    - Project Status: ${context.currentStage}
    - Equipment Active: ${context.equipment?.length || 0} units
    - Recent Readings (Last 24h): ${JSON.stringify(context.readings?.slice(-2))}
    - New Photos Taken: ${context.newPhotosCount || 0}
    - Compliance Issues: ${context.complianceIssues || 'None'}
    
    INSTRUCTIONS:
    - Write in past tense, professional tone.
    - Mention specific atmospheric changes if readings are available.
    - Mention equipment manipulation.
    - Mention safety checks.
    - Keep it under 100 words.
    - ALL field reports MUST be wrapped in markdown code blocks (\`\`\`).
    - Use plain-text dashes (-) for individual sentences/bullet points to prevent markdown parsers from converting them into standard HTML lists.
    `;

    return await this.execute('DEEP_REASONING', prompt);
  }

  async generateComprehensiveReport(reportType: 'daily' | 'final' | 'insurance' | 'assessment' | 'psychrometric', projectContext: unknown, imagesBase64?: string[]): Promise<GenerateContentResponse> {
    const prompt = `Act as an expert IICRC-certified Water Mitigation Estimator and Technician.
    Generate a highly professional, comprehensive, and client-ready report for a water mitigation project.
    
    Report Type: ${reportType.toUpperCase()}
    
    Project Context Data: 
    ${JSON.stringify(projectContext)}
    
    INSTRUCTIONS:
    - Use Markdown formatting with clear headings, bullet points, and tables where appropriate.
    - Ensure the report explicitly pulls and highlights the following key data points across all relevant report types:
      * **Project Scope**: The boundaries and extent of the mitigation work.
      * **Damages Found**: Specific locations, affected materials, and severity of the water damage.
      * **Mitigation Steps Taken**: The actions performed to stabilize and dry the structure.
      * **Materials and Equipment Used**: The consumables, building materials, and drying equipment deployed.
    - If the report type is 'daily', focus on the work in progress, daily readings, equipment status, and next steps.
    - If the report type is 'final', include sections for initial conditions, work performed throughout the project duration, final structural materials status (completion status), and sign-off.
    - If the report type is 'insurance', focus on the claim details, justification of the scope of work (mitigation steps taken), estimated costs/line items, and compliance verification (IICRC standards).
    - If the report type is 'assessment', focus on the initial damage assessment. You MUST include explicit sections for: Cause of Damage, Affected Materials, and Initial Mitigation Steps Taken. Base this on the provided project context, photos context, and initial conditions.
    - If the report type is 'psychrometric', focus on psychrometric drying conditions, atmospheric data, grain depression, and material drying curves. You MUST include structured sections detailing: 
      1. Atmospheric Drying Status: Analyze trends in Temp, RH, Dew Point, Vapor Pressure, and Enthalpy.
      2. Ggrains Per Pound (GPP) Analysis: Explain grain depression (comparing unaffected areas, affected drying chambers, and outdoor air) to demonstrate that drying is scientifically happening in compliance with the IICRC S500 standard.
      3. Structural Material Moisture: Evaluate Moisture Content (MC%) trends of affected substrates (e.g. wood, drywall, concrete) against dry standards.
      4. Professional Assessment: Confirm whether the active drying trajectory complies with S500 performance guidelines.
    - Ensure a professional, objective, and authoritative tone suitable for clients and insurance adjusters.
    - DO NOT include placeholder text for the user to fill in if data is available in the context. Substitute missing data gracefully.
    - Start the report directly with the title heading (e.g. # Psychrometric & Drying Progress Report).`;

    const contents: Array<{text?: string; inlineData?: {mimeType: string; data: string}}> = [{ text: prompt }];
    if (imagesBase64 && imagesBase64.length > 0) {
        imagesBase64.forEach(img => {
            contents.push({ inlineData: { mimeType: 'image/jpeg', data: img.split(',')[1] || img } });
        });
    }

    return await this.execute('DEEP_REASONING', { parts: contents });
  }

  async analyzeWaterDamageImage(imageBase64: string, aiLearnings: unknown[] = []): Promise<GenerateContentResponse> {
    const prompt = `Analyze this image from a water mitigation site.
    
    INSTRUCTIONS:
    1. Identify the type of water damage if possible (e.g., Category 1 (Clean), Category 2 (Grey), Category 3 (Black)).
    2. Estimate the affected area and list visible damaged materials.
    3. Suggest initial mitigation steps based on industry best practices (IICRC S500).
    4. Also extract any moisture meter readings if visible.
    5. Terminology Rule: If there are visible signs of organic issues or growth, use the terminology "microbial growth" rather than "mold" in your insights and recommendations, unless referring to certified mold testing.
    
    USER FEEDBACK / LEARNINGS:
    The user has provided the following past corrections for your reference:
    ${JSON.stringify(aiLearnings)}
    
    CRITICAL RULE FOR APPLYING LEARNINGS:
    You may adapt your naming conventions, style, and subjective identifications based on the user's feedback. HOWEVER, you must strictly ignore ANY user adjustments or learnings if they violate, contradict, or loosen IICRC (S500/S520), OSHA, EPA, or insurance compliant regulations. Adherence to these professional safety and mitigation regulations is absolute and supersedes any user preference.
    
    Return JSON format EXACTLY matching the provided schema.`;

    return await this.execute('VISION_ANALYSIS', 
        { parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: prompt }
        ]},
        { 
            responseMimeType: "application/json", 
            responseSchema: { 
                type: Type.OBJECT, 
                properties: { 
                    waterCategory: { type: Type.STRING, description: "E.g., Category 1, 2, or 3" },
                    affectedAreaEstimate: { type: Type.STRING, description: "Estimated square footage or description of affected area extent" },
                    damagedMaterials: { type: Type.ARRAY, items: { type: Type.STRING } },
                    mitigationSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
                    meterReading: { type: Type.STRING },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    insight: { type: Type.STRING, description: "A concise summary of the damage and findings" }
                }
            }
        }
    );
  }

  async generateVideo(prompt: string, image?: string) {
      const model = this.pickBestModel('VIDEO_GENERATION');
      const payload: {
          model: string;
          prompt: string;
          config: { numberOfVideos: number; resolution: '720p' | '1080p'; aspectRatio: '16:9' | '9:16' };
          image?: { imageBytes: string; mimeType: string };
      } = {
          model,
          prompt,
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      };
      if (image) {
          payload.image = { imageBytes: image.split(',')[1], mimeType: 'image/png' };
      }
      this.ctx.model = model;
      this.ctx.step = "VIDEO_GENERATION";
      return await trackGeminiCall(this.ctx, () => this.ai.models.generateVideos(payload) as unknown as Promise<GenerateContentResponse>);
  }

  

  async detectMoistureAnomalies(materialsData: unknown): Promise<GenerateContentResponse> {
    const prompt = `Act as an expert IICRC-certified Water Mitigation Technician.
    Analyze the following moisture reading history for tracked materials in a drying environment.
    Identify if any materials are significantly deviating from standard dry-out curves, indicating a potential failure in the drying process (e.g., equipment failure, hidden moisture source, improper containment).

    Data:
    ${JSON.stringify(materialsData)}

    Provide a JSON array of anomalies. For each anomaly, include the material name, location, a severity level ('low', 'medium', 'high'), and a brief description of the issue and recommended action. If there are no anomalies, return an empty array.
    `;

    return await this.execute('DEEP_REASONING', prompt, {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            material: { type: Type.STRING },
            location: { type: Type.STRING },
            severity: { type: Type.STRING },
            description: { type: Type.STRING },
            recommendedAction: { type: Type.STRING }
          }
        }
      }
    });
  }

  async analyzeMediaMitigationAssessment(params: {
    mediaItems: Array<{
      id: string;
      name: string;
      type: 'image' | 'video';
      base64?: string;
      frames?: string[];
      notes?: string;
      roomTag?: string;
    }>;
    technicianNotes?: string;
    projectContext?: {
      client?: string;
      address?: string;
      waterCategory?: string;
      lossClass?: string;
      lossDate?: string;
      summary?: string;
    };
  }): Promise<GenerateContentResponse> {
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Attach images / frames
    params.mediaItems.forEach((item) => {
      if (item.base64) {
        const cleanBase64 = item.base64.includes(',') ? item.base64.split(',')[1] : item.base64;
        const mime = item.base64.includes('data:image/png') ? 'image/png' : 'image/jpeg';
        parts.push({ inlineData: { mimeType: mime, data: cleanBase64 } });
      }
      if (item.frames && item.frames.length > 0) {
        item.frames.forEach((frame) => {
          const cleanFrame = frame.includes(',') ? frame.split(',')[1] : frame;
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: cleanFrame } });
        });
      }
    });

    const mediaDescriptions = params.mediaItems.map((m, i) => 
      `[Media #${i + 1} (${m.type.toUpperCase()})]: ${m.name} | Room: ${m.roomTag || 'Unspecified'} | Tech Notes: ${m.notes || 'None'}${m.frames ? ` | (${m.frames.length} keyframes extracted)` : ''}`
    ).join('\n');

    const prompt = `You are a Master IICRC S500/S520 Certified Water Mitigation and Structural Drying Assessor.
Analyze the provided technician media uploads (photos and/or video frames) and field documentation notes to identify and quantify water damage, classify the loss, estimate severity, identify all affected materials, and produce a structured Preliminary Damage Assessment.

PROJECT CONTEXT:
Client: ${params.projectContext?.client || 'Property Owner'}
Address: ${params.projectContext?.address || 'Site Inspection'}
Loss Date: ${params.projectContext?.lossDate || 'Recent'}
Current Notes / Summary: ${params.projectContext?.summary || 'Initial triage'}
Technician Field Notes: ${params.technicianNotes || 'None provided'}

MEDIA CATALOG:
${mediaDescriptions}

MANDATORY IICRC EVALUATION RULES:
1. Water Category Determination (IICRC S500 Section 10):
   - Category 1 (Clean): Sanitary water supply, broken clean pipe, sink overflow with no contaminants.
   - Category 2 (Grey): Dishwasher/washing machine discharge, sump pump failure, aquarium, water containing chemicals or urine.
   - Category 3 (Black): Grossly contaminated, sewage/sewer backup, rising ground floodwaters, sea/river water, or Category 1/2 water left stagnant for >48-72h.
2. Water Loss Class Determination (IICRC S500 Section 10):
   - Class 1: Least amount of water absorption; <5% of combined floor/wall/ceiling area wet.
   - Class 2: Significant water; 5% to 40% of room surfaces wet (e.g. wet carpet, pad, drywall wicking up to 24 inches).
   - Class 3: Greatest amount of water; >40% of surfaces wet (e.g. overhead water from ceiling, saturated walls >24 inches, insulation).
   - Class 4: Deeply held bound moisture in low-evaporation/dense materials (hardwood, plaster, concrete, brick, subfloor assembly).
3. Material Salvageability & Demo Thresholds:
   - Category 3: ALL porous materials in contact (drywall, carpet, pad, fiberglass insulation, MDF/pressed wood trim) MUST be demoed/removed per S500.
   - Category 2: Carpet pad must be discarded; carpet may be cleaned if sanitized and dried rapidly.
   - Drywall wicking: If moisture wicks > 12-24 inches, recommend standard 2ft or 4ft flood cuts.
4. Terminology: Use "microbial growth" or "organic growth potential" rather than informal words.
5. S500 Equipment Calculations:
   - Air Movers: 1 for every 50-70 sq ft of wet floor, plus 1 for each wall inlet or offset.
   - Dehumidification: Sized by room volume (Cubic Feet) divided by Class factor.
   - Air Scrubbers: Required for Category 2/3 or demolition activities (HEPA negative air / air exchange).

Return a single valid JSON object strictly matching the schema.`;

    parts.push({ text: prompt });

    return await this.execute('VISION_ANALYSIS', { parts }, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: { type: Type.STRING, description: "A high-level executive summary of findings for adjuster and client" },
          waterCategory: { type: Type.STRING, description: "Category 1, Category 2, or Category 3 with description" },
          waterCategoryJustification: { type: Type.STRING, description: "Technical justification based on source of water and contamination signs" },
          waterLossClass: { type: Type.STRING, description: "Class 1, Class 2, Class 3, or Class 4 with description" },
          lossClassJustification: { type: Type.STRING, description: "Justification based on evaporation rate, surface area percentage, and material porosity" },
          estimatedSeverity: { type: Type.STRING, enum: ['Minor', 'Moderate', 'Severe', 'Critical', 'Catastrophic'] },
          severityScore: { type: Type.NUMBER, description: "Severity score from 1 (minor) to 100 (catastrophic)" },
          quantifiedMetrics: {
            type: Type.OBJECT,
            properties: {
              totalAffectedSqFt: { type: Type.NUMBER, description: "Estimated total square footage of affected flooring/structure" },
              baseboardsLinearFt: { type: Type.NUMBER, description: "Estimated linear feet of affected baseboard and wall perimeter" },
              drywallFloodCutLinearFt: { type: Type.NUMBER, description: "Estimated linear feet of drywall requiring flood cut" },
              recommendedFloodCutHeightInches: { type: Type.NUMBER, description: "Recommended flood cut height (e.g. 24 or 48 inches)" },
              standingWaterDepthInches: { type: Type.NUMBER, description: "Estimated standing water depth if any visible (0 if extracted)" },
              estimatedGallonsToExtract: { type: Type.NUMBER, description: "Estimated extraction volume in gallons" }
            },
            required: ['totalAffectedSqFt', 'baseboardsLinearFt', 'drywallFloodCutLinearFt', 'recommendedFloodCutHeightInches', 'standingWaterDepthInches', 'estimatedGallonsToExtract']
          },
          affectedMaterials: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Material name e.g. 1/2in Drywall, Carpet Pad, Hardwood Plank, Baseboards" },
                category: { type: Type.STRING, enum: ['Porous', 'Semi-Porous', 'Non-Porous'] },
                location: { type: Type.STRING, description: "Room and specific wall/floor location" },
                severity: { type: Type.STRING, enum: ['Low', 'Medium', 'High', 'Severe'] },
                salvageability: { type: Type.STRING, enum: ['Salvageable', 'Restorable In-Place', 'Demolition Required', 'Requires Specialized Drying'] },
                estimatedQuantity: { type: Type.STRING, description: "Quantity with units, e.g. '180 SF', '42 LF'" },
                demoThresholdNotes: { type: Type.STRING, description: "Why demo or in-place drying is recommended per IICRC standard" },
                moistureEstimate: { type: Type.STRING, description: "Estimated moisture saturation level or pin meter expectation" }
              },
              required: ['name', 'category', 'location', 'severity', 'salvageability', 'estimatedQuantity', 'demoThresholdNotes', 'moistureEstimate']
            }
          },
          hazardAssessment: {
            type: Type.OBJECT,
            properties: {
              electricalHazard: { type: Type.BOOLEAN },
              structuralCompromise: { type: Type.BOOLEAN },
              microbialRisk: { type: Type.STRING, enum: ['Low', 'Moderate', 'High', 'Immediate Abatement Required'] },
              biohazardPresent: { type: Type.BOOLEAN },
              recommendedPPE: { type: Type.ARRAY, items: { type: Type.STRING } },
              containmentRequired: { type: Type.BOOLEAN },
              containmentType: { type: Type.STRING, description: "Source containment, critical barrier, negative pressure, or none" }
            },
            required: ['electricalHazard', 'structuralCompromise', 'microbialRisk', 'biohazardPresent', 'recommendedPPE', 'containmentRequired', 'containmentType']
          },
          recommendedEquipment: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['Air Mover', 'LGR Dehumidifier', 'Desiccant Dehumidifier', 'HEPA Air Scrubber', 'Extraction Unit', 'Air Injection System'] },
                quantity: { type: Type.NUMBER },
                formulaCalculation: { type: Type.STRING, description: "S500 formula or calculation basis" },
                notes: { type: Type.STRING, description: "Placement and operational guidance" }
              },
              required: ['type', 'quantity', 'formulaCalculation', 'notes']
            }
          },
          immediateActionProtocol: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          lineItemsDraft: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                code: { type: Type.STRING, description: "Xactimate-style code, e.g. WTR EXT, WTR DRY, WTR REM" },
                description: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                category: { type: Type.STRING }
              },
              required: ['code', 'description', 'quantity', 'unit', 'category']
            }
          },
          mediaFindings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                mediaIndex: { type: Type.NUMBER },
                mediaLabel: { type: Type.STRING },
                damageIdentified: { type: Type.STRING },
                materialsDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
                moistureSigns: { type: Type.STRING }
              },
              required: ['mediaIndex', 'mediaLabel', 'damageIdentified', 'materialsDetected', 'moistureSigns']
            }
          }
        },
        required: [
          'executiveSummary', 'waterCategory', 'waterCategoryJustification', 'waterLossClass', 'lossClassJustification',
          'estimatedSeverity', 'severityScore', 'quantifiedMetrics', 'affectedMaterials', 'hazardAssessment',
          'recommendedEquipment', 'immediateActionProtocol', 'lineItemsDraft', 'mediaFindings'
        ]
      }
    });
  }

  async generatePreliminaryDamageReport(
    assessmentData: unknown,
    projectContext: unknown
  ): Promise<GenerateContentResponse> {
    const prompt = `Act as an expert IICRC Master Restorer and Insurance Estimator.
Generate a comprehensive, formal PRELIMINARY DAMAGE ASSESSMENT REPORT (PDAR) in clean Markdown based on the provided AI media analysis and project context.

ASSESSMENT DATA:
${JSON.stringify(assessmentData)}

PROJECT CONTEXT:
${JSON.stringify(projectContext)}

STRUCTURE YOUR REPORT AS FOLLOWS:
# PRELIMINARY WATER DAMAGE ASSESSMENT REPORT
*Standard of Care: ANSI/IICRC S500 Standard and Reference Guide for Professional Water Damage Restoration*

## 1. INCIDENT & SITE OVERVIEW
- Client, Location, Date of Inspection, Lead Technician
- Executive Damage Summary & Probable Source of Intrusion

## 2. IICRC CLASSIFICATION & CONTAMINATION ASSESSMENT
- **Water Category**: [Category & Technical Justification]
- **Water Loss Class**: [Class & Evaporation/Surface Area Justification]
- **Overall Severity Index**: [Rating & Risk Score / 100]

## 3. QUANTIFIED DAMAGE & AFFECTED MATERIALS MATRIX
- Summary of Quantified Metrics (Affected SF, LF Baseboard, Flood Cut Requirements, Gallons Extracted)
- Formatted Table of Affected Materials:
  | Material | Category | Location | Severity | Salvageability | Est. Qty | Demo / Restoration Directive |
  |---|---|---|---|---|---|---|

## 4. SAFETY & ENVIRONMENTAL HAZARD DIRECTIVES
- Electrical & Structural Integrity Evaluation
- Microbial & Biohazard Containment Strategy
- Required Personal Protective Equipment (PPE)

## 5. IMMEDIATE STABILIZATION & MITIGATION PROTOCOL
- Step-by-step action plan in sequential execution order (Extraction -> Containment -> Controlled Demo -> Antimicrobial -> Drying System Placement)

## 6. S500 EQUIPMENT SIZING & DRYING CHAMBER DEPLOYMENT
- Calculated Air Movers (LF/SF sizing formula)
- Dehumidification Capacity (AHAM Pints/Day sizing formula)
- Air Filtration Devices (HEPA Air Scrubbers)

## 7. PRELIMINARY SCOPE OF WORK (XACTIMATE ESTIMATING DRAFT)
- Key line items with quantities, units, and billing codes for insurance review.

## 8. TECHNICIAN CERTIFICATION & CLOSING REMARKS
- Formal sign-off declaration adhering to IICRC S500 protocols.

Ensure high professional rigor, clear tables, and insurance-ready terminology.`;

    return await this.execute('DEEP_REASONING', prompt);
  }

  getOperationsClient() {
      return this.ai.operations;
  }
}

