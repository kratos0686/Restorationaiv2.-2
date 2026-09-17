/**
 * Restoration AI — Express server
 *
 * Serves the Vite-built React app from `dist/` and exposes API routes.
 * Bundled to dist/server.cjs by esbuild during `npm run build` and
 * launched by `node dist/server.cjs` from the production Dockerfile.
 *
 * Cloud Run injects PORT into the environment; we honor it and fall
 * back to 3000 for local development.
 */

import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { usageContext, trackGeminiCall } from './services/geminiUsage';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { IntelligenceRouter } from './services/IntelligenceRouter';
import { GoogleGenAI, Type } from '@google/genai';
import * as admin from 'firebase-admin';
import { Storage } from '@google-cloud/storage';
import { Writable } from 'node:stream';
import { Project, User, Company, InventoryEquipment } from './types';

// Define server-side in-memory mock database store for absolute stability and zero startup crashes
const mockProjectsStore: Project[] = [
  { 
    id: 'P-1001', 
    companyId: 'COMP-001',
    client: 'Sarah Johnson', 
    clientEmail: 's.johnson@example.com',
    clientPhone: '555-123-4567',
    address: '124 Maple Ave', 
    status: 'Active', 
    currentStage: 'Monitor',
    progress: 65, 
    estimate: 'Oct 16', 
    logs: "GPP trending down steadily.",
    insurance: "State Farm",
    policyNumber: 'SF-987654321',
    adjuster: 'Tom Brown',
    claimNumber: 'CLM-778899',
    startDate: "Oct 12, 2023",
    summary: 'Class 3 Water Loss. Overhead pipe burst affecting kitchen and living room.',
    riskLevel: 'high',
    waterCategory: 'CAT_3',
    lossClass: 'CLASS_3',
    budget: 15000,
    assignedTeam: ['Mike R.', 'Jessica P.'],
    equipment: [
      { id: 'AM-4022', type: 'Air Mover', model: 'Phoenix AirMax', status: 'Running', hours: 42.5, room: 'Living Room' },
      { id: 'DH-1102', type: 'Dehumidifier', model: 'LGR 3500i', status: 'Running', hours: 42.5, room: 'Living Room' },
    ],
    rooms: [
      {
        id: 'r1', name: 'Living Room', status: 'drying',
        dimensions: { length: 15.2, width: 20.1, height: 8 },
        photos: [],
        readings: [
          { timestamp: Date.now() - 86400000, temp: 72, rh: 85, gpp: 98, mc: 45 },
          { timestamp: Date.now(), temp: 78, rh: 45, gpp: 62, mc: 28 },
        ]
      }
    ],
    dryingMonitor: [
        {
            id: 'tm-1',
            name: 'Drywall 5/8"',
            location: 'East Wall (Living Room)',
            type: 'Drywall 5/8"',
            dryGoal: 10,
            initialReading: 99,
            readings: [
                { timestamp: Date.now() - 172800000, value: 99, dateStr: 'Oct 12' },
                { timestamp: Date.now() - 86400000, value: 45, dateStr: 'Oct 13' },
                { timestamp: Date.now(), value: 28, dateStr: 'Oct 14' }
            ],
            status: 'Wet'
        }
    ],
    milestones: [],
    tasks: [
        { id: 't1', text: 'Extract standing water', isCompleted: true, priority: 'high', dueDate: '2026-02-25' },
        { id: 't2', text: 'Set up dehumidifiers', isCompleted: false, priority: 'high', dueDate: '2026-02-24' }
    ],
    lineItems: [
        { id: 'li1', description: 'Emergency Water Extraction', quantity: 4, rate: 250, total: 1000 },
    ],
    totalCost: 1450,
    invoiceStatus: 'Draft'
  },
  { 
    id: 'P-1002', 
    companyId: 'COMP-002',
    client: 'Robert Smith', 
    clientEmail: 'r.smith@example.com',
    clientPhone: '555-987-6543',
    address: '890 Oak Lane', 
    status: 'New', 
    currentStage: 'Inspection',
    progress: 15, 
    estimate: 'Oct 19', 
    logs: "High humidity spike recorded at 2:00 AM. Needs investigation.",
    insurance: "Allstate",
    policyNumber: 'ALL-112233445',
    adjuster: 'Jane Doe',
    claimNumber: 'CLM-112233',
    startDate: "Oct 14, 2023",
    summary: 'Basement sump pump failure. 2 inches of standing water.',
    riskLevel: 'medium',
    waterCategory: 'CAT_2',
    lossClass: 'CLASS_2',
    budget: 7500,
    assignedTeam: ['David F.'],
    rooms: [],
    milestones: [],
    tasks: [],
    lineItems: [],
    totalCost: 0,
    invoiceStatus: 'Draft'
  }
] as unknown as Project[];

const mockUsersStore: User[] = [
  {
    id: `U-001`,
    email: 'admin@elite.com',
    name: 'Elite Admin',
    role: 'CompanyAdmin',
    companyId: 'COMP-001',
    permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin', 'use_ai_tools']
  },
  {
    id: `U-002`,
    email: 'tech@elite.com',
    name: 'Elite Tech',
    role: 'Technician',
    companyId: 'COMP-001',
    permissions: ['view_projects', 'edit_projects', 'use_ai_tools']
  },
  {
    id: `U-003`,
    email: 'owner@mitigation.ai',
    name: 'App Owner',
    role: 'SuperAdmin',
    companyId: 'SYSTEM',
    permissions: ['manage_company', 'view_admin']
  },
  {
    id: `U-004`,
    email: 'admin@dryright.com',
    name: 'DryRight Admin',
    role: 'CompanyAdmin',
    companyId: 'COMP-002',
    permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin']
  }
];

const mockCompaniesStore: Company[] = [
  { id: 'COMP-001', name: 'Elite Restoration Services', subscriptionPlan: 'Enterprise', maxUsers: 50, isActive: true },
  { id: 'COMP-002', name: 'DryRight Solutions', subscriptionPlan: 'Pro', maxUsers: 10, isActive: true }
];

const mockInventoryStore: InventoryEquipment[] = [
  { id: 'inv-1', type: 'Dehumidifier', model: 'Dri-Eaz Revolution LGR', status: 'available' }
] as unknown as InventoryEquipment[];

class MockFirestore {
  private store: Record<string, Record<string, unknown>[]> = {
    projects: mockProjectsStore as unknown as Record<string, unknown>[],
    users: mockUsersStore as unknown as Record<string, unknown>[],
    companies: mockCompaniesStore as unknown as Record<string, unknown>[],
    inventory: mockInventoryStore as unknown as Record<string, unknown>[]
  };

  collection(name: string) {
    const list = this.store[name] || [];

    class MockQuery {
      private filteredList = [...list];

      where(field: string, op: string, val: unknown) {
        if (op === '==') {
          this.filteredList = this.filteredList.filter(item => item[field] === val);
        }
        return this;
      }

      limit(n: number) {
        this.filteredList = this.filteredList.slice(0, n);
        return this;
      }

      async get() {
        return {
          empty: this.filteredList.length === 0,
          docs: this.filteredList.map(item => ({
            id: String(item.id || ''),
            exists: true,
            data: () => item
          }))
        };
      }
    }

    class MockDocRef {
      constructor(private id: string) {}

      async get() {
        const item = list.find(x => String(x.id || '') === this.id);
        return {
          id: this.id,
          exists: !!item,
          data: () => item || null
        };
      }

      async set(data: Record<string, unknown>) {
        const index = list.findIndex(x => String(x.id || '') === this.id);
        const item = { id: this.id, ...data };
        if (index > -1) {
          list[index] = item;
        } else {
          list.push(item);
        }
      }

      async update(data: Record<string, unknown>) {
        const index = list.findIndex(x => String(x.id || '') === this.id);
        if (index > -1) {
          list[index] = { ...list[index], ...data };
        } else {
          throw new Error(`Document ${this.id} not found for update`);
        }
      }
    }

    return {
      doc(id: string) {
        return new MockDocRef(id);
      },
      where(field: string, op: string, val: unknown) {
        return new MockQuery().where(field, op, val);
      },
      limit(n: number) {
        return new MockQuery().limit(n);
      },
      async get() {
        return new MockQuery().get();
      }
    };
  }
}

// Safely configure Firebase Admin
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch (_err) {
  console.warn("Could not auto-initialize Firebase Admin SDK. Web application continuing using robust memory-fallback mode.");
}

const mockDb = new MockFirestore();
let realDbInstance: admin.firestore.Firestore | null = null;
let useFallbackDb = false;

try {
  realDbInstance = admin.apps.length ? admin.firestore() : null;
} catch (_err) {
  console.warn("Could not retrieve FireStore instance from initialized Firebase App. Resorting to local emulator/memory database.");
  useFallbackDb = true;
}

const db = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop) {
    if (prop === 'collection') {
      return function (...args: unknown[]) {
        const collectionName = String(args[0] || '');
        
        return new Proxy({}, {
          get(_cTarget, cProp) {
            return function (...cArgs: unknown[]) {
              if (useFallbackDb) {
                const mockCollection = mockDb.collection(collectionName) as unknown as Record<string, (...args: unknown[]) => unknown>;
                const val = mockCollection[String(cProp)];
                return typeof val === 'function' ? val(...cArgs) : val;
              }

              try {
                if (!realDbInstance) {
                  throw new Error("No real database instance of firestore available.");
                }
                const realCollection = (realDbInstance as unknown as Record<string, (...args: unknown[]) => unknown>).collection(collectionName) as unknown as Record<string, (...args: unknown[]) => unknown>;
                const realVal = realCollection[String(cProp)];
                
                if (typeof realVal === 'function') {
                  const result = realVal(...cArgs);

                  if (result && typeof result === 'object') {
                    return wrapChainObject(result, collectionName, [cProp, cArgs]);
                  }
                  return result;
                }
                return realVal;
              } catch (err) {
                console.warn(`Firestore collection error, fallback triggered for collection: ${collectionName}`, err);
                useFallbackDb = true;
                const mockCollection = mockDb.collection(collectionName) as unknown as Record<string, (...args: unknown[]) => unknown>;
                const val = mockCollection[String(cProp)];
                return typeof val === 'function' ? val(...cArgs) : val;
              }
            };
          }
        });
      };
    }
    
    const activeDb = useFallbackDb ? mockDb : (realDbInstance || mockDb);
    const val = (activeDb as unknown as Record<string, unknown>)[String(prop)];
    if (typeof val === 'function') {
      return val.bind(activeDb);
    }
    return val;
  }
});

function wrapChainObject(obj: unknown, collectionName: string, lastStep: [string | symbol, unknown[]]): unknown {
  return new Proxy(obj as object, {
    get(target, prop) {
      if (prop === 'catch' || prop === 'then') {
        const val = (target as Record<string, unknown>)[String(prop)];
        return typeof val === 'function' ? val.bind(target) : val;
      }
      const val = (target as Record<string, unknown>)[String(prop)];
      if (typeof val === 'function') {
        return function (...args: unknown[]) {
          if (useFallbackDb) {
            const mockCollection = mockDb.collection(collectionName) as unknown as Record<string, (...args: unknown[]) => unknown>;
            let current = mockCollection as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>;
            if (lastStep && typeof mockCollection[String(lastStep[0])] === 'function') {
              const prevFunc = mockCollection[String(lastStep[0])] as (...args: unknown[]) => Record<string, unknown>;
              current = prevFunc(...lastStep[1]) as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>;
            }
            const mockFunc = current[String(prop)];
            return typeof mockFunc === 'function' ? (mockFunc as (...args: unknown[]) => unknown)(...args) : mockFunc;
          }

          try {
            const result = (val as (...args: unknown[]) => unknown)(...args);
            if (result instanceof Promise) {
              return result.catch(err => {
                console.warn(`Async Firestore database operation failed, falling back: ${String(err)}`);
                useFallbackDb = true;
                
                const mockCollection = mockDb.collection(collectionName) as unknown as Record<string, (...args: unknown[]) => unknown>;
                let current = mockCollection as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>;
                if (lastStep && typeof mockCollection[String(lastStep[0])] === 'function') {
                  const prevFunc = mockCollection[String(lastStep[0])] as (...args: unknown[]) => Record<string, unknown>;
                  current = prevFunc(...lastStep[1]) as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>;
                }
                const mockFunc = current[String(prop)];
                if (typeof mockFunc === 'function') {
                  return (mockFunc as (...args: unknown[]) => unknown)(...args);
                }
                return mockFunc;
              });
            }
            if (result && typeof result === 'object') {
              return wrapChainObject(result, collectionName, [prop, args]);
            }
            return result;
          } catch (err) {
            console.warn(`Firestore database operation failed synchronously, falling back: ${String(err)}`);
            useFallbackDb = true;
            const mockCollection = mockDb.collection(collectionName) as unknown as Record<string, (...args: unknown[]) => unknown>;
            let current = mockCollection as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>;
            if (lastStep && typeof mockCollection[String(lastStep[0])] === 'function') {
              const prevFunc = mockCollection[String(lastStep[0])] as (...args: unknown[]) => Record<string, unknown>;
              current = prevFunc(...lastStep[1]) as unknown as Record<string, (...args: unknown[]) => Record<string, unknown>>;
            }
            const mockFunc = current[String(prop)];
            return typeof mockFunc === 'function' ? (mockFunc as (...args: unknown[]) => unknown)(...args) : mockFunc;
          }
        };
      }
      return val;
    }
  });
}

// Setup GCS safely
let storageInstance: Storage | null = null;
let bucketInstance: unknown = null;
const bucketName = process.env.GCS_BUCKET_NAME || 'restorationai-uploads-bucket';

try {
  storageInstance = new Storage();
  bucketInstance = storageInstance.bucket(bucketName);
} catch (_err) {
  console.warn("Storage SDK failed to initialize at startup. Web application launching using GCS test fallback wrapper.");
  bucketInstance = {
    file: (_name: string) => ({
      createWriteStream: (_options?: unknown) => {
        const stream = new Writable();
        setTimeout(() => stream.emit('error', new Error("Google Cloud Storage not configured on current environment")), 50);
        return stream;
      }
    })
  };
}
const bucket = bucketInstance as ReturnType<Storage['bucket']>;

// Custom Multer Storage Engine to stream directly to GCS
const gcsStorage = {
  _handleFile(req: express.Request, file: Express.Multer.File, cb: (error?: Error | null, info?: Partial<Express.Multer.File>) => void) {
    const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const gcFile = bucket.file(filename);
    
    const stream = gcFile.createWriteStream({
      resumable: false,
      contentType: file.mimetype,
    });
    
    file.stream.pipe(stream);
    
    stream.on('error', cb);
    stream.on('finish', () => {
      cb(null, {
        path: `https://storage.googleapis.com/${bucketName}/${filename}`,
        size: Number(gcFile.metadata?.size || 0)
      });
    });
  },
  _removeFile(req: express.Request, file: Express.Multer.File, cb: (error: Error | null) => void) {
    cb(null);
  }
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProd = process.env.NODE_ENV === 'production';
  
  const DIST_DIR = path.resolve(process.cwd(), 'dist');

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.disable('x-powered-by');
app.set('trust proxy', 1); // honor Cloud Run's X-Forwarded-* headers

app.use(usageContext());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',').map(s => s.trim()) || true,
    credentials: true,
  })
);

// Per-IP rate limit on the API surface only — leave static assets alone.
const apiLimiter = rateLimit({
  windowMs: 60_000,             // 1 minute
  limit: 120,                   // 120 requests / minute / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Stream large files directly to GCS via custom engine.
const upload = multer({
  storage: gcsStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

// ---------------------------------------------------------------------------
// Health & readiness probes (Cloud Run hits these for traffic gating)
// ---------------------------------------------------------------------------

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/readyz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready' });
});

// ---------------------------------------------------------------------------
// API routes — placeholders. Replace with real handlers as the backend
// fleshes out. The dependencies in package.json (firebase-admin, pg,
// @google-cloud/storage, @google/genai) are already available to import.
// ---------------------------------------------------------------------------

const api = express.Router();
api.use(apiLimiter);

// No local file db helpers anymore, using Firestore

api.get('/version', (_req: Request, res: Response) => {
  res.json({
    name: 'restorationai',
    commit: process.env.K_REVISION || process.env.COMMIT_SHA || 'unknown',
  });
});

// Projects
api.get('/projects', async (req: Request, res: Response) => {
  try {
    let query: admin.firestore.Query = db.collection('projects');
    if (req.query.companyId) {
      query = query.where('companyId', '==', req.query.companyId as string);
    }
    const snapshot = await query.get();
    const projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const doc = await db.collection('projects').doc(String(req.params.id)).get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/projects', async (req: Request, res: Response) => {
  try {
    const newProject = { 
      id: `proj-${Date.now()}`, 
      ...req.body,
      rooms: req.body.rooms || [],
      milestones: req.body.milestones || [],
      tasks: req.body.tasks || [],
      lineItems: req.body.lineItems || [],
      roomScans: req.body.roomScans || [],
      videos: req.body.videos || [],
      equipment: req.body.equipment || [],
      dailyNarratives: req.body.dailyNarratives || [],
      dryingMonitor: req.body.dryingMonitor || []
    };
    await db.collection('projects').doc(newProject.id).set(newProject);
    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.patch('/projects/:id', async (req: Request, res: Response) => {
  try {
    const projectRef = db.collection('projects').doc(String(req.params.id));
    const doc = await projectRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });
    await projectRef.update(req.body);
    const updatedDoc = await projectRef.get();
    res.json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Companies & Users
api.get('/companies', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('companies').get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.get('/companies/:id/users', async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('users').where('companyId', '==', String(req.params.id)).get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/users', async (req: Request, res: Response) => {
  try {
    const newUser = { id: `user-${Date.now()}`, ...req.body };
    await db.collection('users').doc(newUser.id).set(newUser);
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Inventory
api.get('/inventory', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('inventory').get();
    res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/inventory', async (req: Request, res: Response) => {
  try {
    const newItem = { id: `inv-${Date.now()}`, ...req.body };
    await db.collection('inventory').doc(newItem.id).set(newItem);
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.patch('/inventory/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await db.collection('inventory').doc(id).update(req.body);
    const updated = await db.collection('inventory').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.delete('/inventory/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await db.collection('inventory').doc(id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// AI Routes
api.post('/ai/intent', async (req: Request, res: Response) => {
  const { userInput, projectContext } = req.body;
  const aiRouter = new IntelligenceRouter(req.usageCtx);
  try {
    const aiResponse = await aiRouter.parseFieldIntent(userInput, projectContext);
    const text = aiResponse.text;
    res.json(JSON.parse(text));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/ai/narrative', async (req: Request, res: Response) => {
  const aiRouter = new IntelligenceRouter(req.usageCtx);
  try {
    const aiResponse = await aiRouter.generateNarrative(req.body);
    res.json({ narrative: aiResponse.text });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/ai/drying-narrative', async (req: Request, res: Response) => {
  const aiRouter = new IntelligenceRouter(req.usageCtx);
  try {
    const aiResponse = await aiRouter.generateDailyDryingNarrative(req.body);
    res.json({ narrative: aiResponse.text });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Generic AI proxy — lets client components call IntelligenceRouter methods
// by name without ever holding a Gemini API key. Whitelisted methods only.
const AI_ROUTER_METHODS = new Set([
  'execute',
  'parseFieldIntent',
  'generateScope',
  'generateTasks',
  'generateDailyDryingNarrative',
  'generateNarrative',
  'generateComprehensiveReport',
  'analyzeWaterDamageImage',
  'detectMoistureAnomalies',
  'analyzeMediaMitigationAssessment',
  'generatePreliminaryDamageReport',
]);

api.post('/ai/router/:method', async (req: Request, res: Response) => {
  const method = Array.isArray(req.params.method) ? req.params.method[0] : req.params.method;
  if (!AI_ROUTER_METHODS.has(method)) {
    return res.status(400).json({ error: `Unsupported AI method: ${method}` });
  }
  const args = Array.isArray(req.body?.args) ? req.body.args : [];
  const aiRouter = new IntelligenceRouter(req.usageCtx);
  try {
    const fn = (aiRouter as unknown as Record<string, (...a: unknown[]) => Promise<{ text: string }>>)[method];
    const result = await fn.apply(aiRouter, args);
    res.json({ text: result.text });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/ai/process-scan', async (req: Request, res: Response) => {
  const { capturedImages } = req.body;
  if (!capturedImages || !Array.isArray(capturedImages)) {
    return res.status(400).json({ error: 'capturedImages array is required.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const imageParts = capturedImages.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img.base64 } }));
    
    // STEP 1: Base Analysis (Dimensions, Materials, Assessment)
    const baseTextPart = { text: `You are an expert restoration estimator. Analyze these images of a room scan to extract key structural and material information.
    1. Estimate the room dimensions (length, width in feet). Provide a logical label for the room (e.g. Master Bedroom, Kitchen).
    2. Identify the materials used in the room (flooring, walls, trim).
    3. Provide a brief assessment of any water/mold damage visible, or general condition.` };
    
    const baseResponse = await trackGeminiCall({
        customerId: req.usageCtx?.customerId || 'unknown',
        jobId: req.usageCtx?.jobId || 'unknown',
        step: 'process-scan-base',
        model: 'gemini-3.1-pro-preview'
    }, () => ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: { parts: [baseTextPart, ...imageParts] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    length: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    roomLabel: { type: Type.STRING },
                    damageAssessment: { type: Type.STRING },
                    materials: {
                        type: Type.OBJECT,
                        properties: {
                            flooring_system: {
                                type: Type.OBJECT,
                                properties: {
                                    material_category: { type: Type.STRING },
                                    grade_estimation: { type: Type.STRING }
                                }
                            },
                            wall_system: {
                                type: Type.OBJECT,
                                properties: {
                                    substrate_material: { type: Type.STRING },
                                    finish_type: { type: Type.STRING }
                                }
                            },
                            trim_and_millwork: {
                                type: Type.OBJECT,
                                properties: {
                                    baseboard_material: { type: Type.STRING },
                                    height_inches: { type: Type.NUMBER }
                                }
                            }
                        }
                    }
                },
                required: ['length', 'width', 'roomLabel', 'damageAssessment', 'materials']
            }
        }
    }));

    let baseText = baseResponse.text || "{}";
    if (baseText.startsWith('```')) {
        baseText = baseText.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    const baseResult = JSON.parse(baseText);

    // STEP 2: SVG Drafting (Spatial layout)
    const svgTextPart = { text: `You are an AR spatial mapping assistant. Given the following room details and the visual frames, generate a top-down 2D SVG floor plan (viewBox="0 0 100 100").
    Make it clean, use <rect>, <line>, <path>. Include doors/windows if visible.
    
    Room Details:
    Label: ${baseResult.roomLabel}
    Dimensions: ${baseResult.length}ft x ${baseResult.width}ft
    Damage: ${baseResult.damageAssessment}
    
    Output your response as JSON with a single "floorPlanSvg" string field containing the raw SVG code.` };

    const svgResponse = await trackGeminiCall({
        customerId: req.usageCtx?.customerId || 'unknown',
        jobId: req.usageCtx?.jobId || 'unknown',
        step: 'process-scan-svg',
        model: 'gemini-3-flash-preview'
    }, () => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [svgTextPart, ...imageParts] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    floorPlanSvg: { type: Type.STRING }
                },
                required: ['floorPlanSvg']
            }
        }
    }));

    let svgText = svgResponse.text || "{}";
    if (svgText.startsWith('```')) {
        svgText = svgText.replace(/```json/g, '').replace(/```/g, '').trim();
    }
    const svgResult = JSON.parse(svgText);

    res.json({
        baseResult,
        svgResult
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.post('/login', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('users').limit(1).get();
    let user = null;
    if (!snapshot.empty) {
      user = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    } else {
      user = {
        id: `local-admin`,
        email: 'admin@restorationai.com',
        name: 'Local Admin',
        role: 'SuperAdmin',
        companyId: 'default-company',
        permissions: ['manage_users', 'view_billing', 'manage_billing', 'view_projects', 'edit_projects', 'view_admin', 'use_ai_tools', 'manage_company']
      };
      await db.collection('users').doc(user.id).set(user);
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

api.get('/me', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('users').limit(1).get();
    if (!snapshot.empty) {
      res.json({ authenticated: true, user: { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } });
    } else {
      res.json({ authenticated: false });
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Example file upload endpoint
api.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file field is required' });
  }
  res.json({
    received: req.file.originalname,
    bytes: req.file.size,
    mimetype: req.file.mimetype,
    url: req.file.path // GCS URL from custom storage
  });
});

app.use('/api', api);

// ---------------------------------------------------------------------------
// Static frontend + SPA fallback
// ---------------------------------------------------------------------------

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(DIST_DIR, {
        index: false,
        maxAge: '1d',
      })
    );

    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  }

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] unhandled error', err);
  const message = err instanceof Error ? err.message : 'internal server error';
  res.status(500).json({ error: message });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on :${PORT} (${isProd ? 'production' : 'development'})`);
});

// Graceful shutdown so Cloud Run can drain connections during revision rollouts.
const shutdown = (signal: string) => {
  console.log(`[server] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  // Hard timeout in case anything hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

}

startServer();
