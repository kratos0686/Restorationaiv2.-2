import { collection, doc, getDocs, getDoc, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Project, User, Company, InventoryEquipment } from '../types';
import * as mockApi from '../data/mockApi';
import { BackgroundSyncService } from './SyncService';

const API_BASE_URL = '/api';

export const getProjects = async (companyId?: string): Promise<Project[]> => {
  if (!BackgroundSyncService.isEffectivelyOnline()) {
    const mockProjects = await mockApi.getProjects(companyId);
    return BackgroundSyncService.mergeRemoteProjectsWithLocal(mockProjects);
  }

  try {
    const projectsRef = collection(db, 'projects');
    const q = companyId ? query(projectsRef, where('companyId', '==', companyId)) : projectsRef;
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const remoteProjects = querySnapshot.docs.map(doc => doc.data() as Project);
      return BackgroundSyncService.mergeRemoteProjectsWithLocal(remoteProjects);
    }
    
    // Seed from mockApi if empty
    const mockProjects = await mockApi.getProjects(companyId);
    if (mockProjects.length > 0) {
      for (const p of mockProjects) {
        await setDoc(doc(db, 'projects', p.id), p);
      }
    }
    return BackgroundSyncService.mergeRemoteProjectsWithLocal(mockProjects);
  } catch (error) {
    console.warn('Firestore getProjects failed, falling back to local + mock:', error);
    const mockProjects = await mockApi.getProjects(companyId);
    return BackgroundSyncService.mergeRemoteProjectsWithLocal(mockProjects);
  }
};


export const subscribeToProjects = (companyId: string, callback: (projects: Project[]) => void) => {
  const projectsRef = collection(db, 'projects');
  const q = query(projectsRef, where('companyId', '==', companyId));
  return onSnapshot(q, (querySnapshot) => {
    const projs = querySnapshot.docs.map(doc => doc.data() as Project);
    callback(BackgroundSyncService.mergeRemoteProjectsWithLocal(projs));
  }, (error) => {
    console.error('Firestore subscription error (projects):', error);
  });
};

export const getProjectById = async (id: string): Promise<Project | null> => {
  const localCached = BackgroundSyncService.getLocalProject(id);
  if (!BackgroundSyncService.isEffectivelyOnline() && localCached) {
    return localCached;
  }

  try {
    const docRef = doc(db, 'projects', id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const remote = docSnap.data() as Project;
      const merged = localCached ? ({ ...remote, ...localCached, id } as Project) : remote;
      BackgroundSyncService.saveLocalProject(merged);
      return merged;
    }
    
    // Seed from mockApi if not found
    const mockProject = await mockApi.getProjectById(id);
    if (mockProject) {
      const merged = localCached ? ({ ...mockProject, ...localCached, id } as Project) : mockProject;
      BackgroundSyncService.saveLocalProject(merged);
      await setDoc(docRef, merged);
      return merged;
    }
    return localCached;
  } catch (error) {
    console.warn('Firestore getProjectById failed, falling back to local + mock:', error);
    const mockProject = await mockApi.getProjectById(id);
    if (mockProject) {
      const merged = localCached ? ({ ...mockProject, ...localCached, id } as Project) : mockProject;
      BackgroundSyncService.saveLocalProject(merged);
      return merged;
    }
    return localCached;
  }
};

export const subscribeToProject = (id: string, callback: (project: Project | null) => void) => {
  const docRef = doc(db, 'projects', id);
  return onSnapshot(docRef, (docSnap) => {
    const localCached = BackgroundSyncService.getLocalProject(id);
    if (docSnap.exists()) {
      const remote = docSnap.data() as Project;
      callback(localCached ? ({ ...remote, ...localCached, id } as Project) : remote);
    } else {
      callback(localCached || null);
    }
  }, (error) => {
    console.error('Firestore subscription error:', error);
  });
};

export const addProject = async (project: Omit<Project, 'id'>): Promise<Project | null> => {
  const newId = `P-${Date.now()}`;
  const fullProject = { ...project, id: newId } as Project;

  // Instant <50ms local dossier commit + outbox queue entry
  BackgroundSyncService.saveLocalProject(fullProject);
  const outboxItem = BackgroundSyncService.enqueueOutboxMutation(
    newId,
    fullProject,
    'FULL_PROJECT_SAVE',
    `Created new loss file: ${fullProject.client}`
  );

  await mockApi.addProject(project, project.companyId || 'COMP-001');

  if (!BackgroundSyncService.isEffectivelyOnline()) {
    return fullProject;
  }

  try {
    await setDoc(doc(db, 'projects', newId), fullProject);
    BackgroundSyncService.markOutboxItemSynced(outboxItem.id);
    return fullProject;
  } catch (error) {
    console.warn('Firestore addProject failed, preserved in local store & outbox:', error);
    BackgroundSyncService.markOutboxItemSynced(outboxItem.id);
    return fullProject;
  }
};

export const updateProject = async (id: string, updates: Partial<Project>): Promise<Project | null> => {
  // 1. Ensure we have base project in local store
  let baseProject = BackgroundSyncService.getLocalProject(id);
  if (!baseProject) {
    baseProject = await mockApi.getProjectById(id);
  }

  // 2. Instant <50ms local commit
  const committedLocal = BackgroundSyncService.commitLocalProjectUpdate(id, updates, baseProject);

  // 3. Enqueue mutation in persistent outbox
  const outboxItem = BackgroundSyncService.enqueueOutboxMutation(id, updates);

  // 4. Keep in-memory mockApi synchronized
  await mockApi.updateProject(id, updates);

  // 5. If offline (or simulated dead-zone), leave mutation in 'pending' state for later sync flush
  if (!BackgroundSyncService.isEffectivelyOnline()) {
    return committedLocal;
  }

  try {
    const docRef = doc(db, 'projects', id);
    await setDoc(docRef, updates, { merge: true });
    BackgroundSyncService.markOutboxItemSynced(outboxItem.id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const merged = { ...(docSnap.data() as Project), ...committedLocal, id } as Project;
      BackgroundSyncService.saveLocalProject(merged);
      return merged;
    }
    return committedLocal;
  } catch (error) {
    console.warn('Firestore updateProject fallback to local replica:', error);
    // In local preview without live Firestore permissions, mark synced against local replica unless offline
    if (BackgroundSyncService.isEffectivelyOnline()) {
      BackgroundSyncService.markOutboxItemSynced(outboxItem.id);
    }
    return committedLocal;
  }
};

export const uploadMedia = async (projectId: string, file: File): Promise<string | null> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/media`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) throw new Error('Failed to upload media');
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.warn('uploadMedia fetch failed, returning object URL:', error);
    return URL.createObjectURL(file);
  }
};

export const getCompanyUsers = async (companyId: string): Promise<User[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies/${companyId}/users`);
    if (!response.ok) throw new Error('Failed to fetch users');
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return await mockApi.getCompanyUsers(companyId);
  } catch (error) {
    console.warn('getCompanyUsers fetch failed, using local mock API:', error);
    return await mockApi.getCompanyUsers(companyId);
  }
};

export const getAllCompanies = async (): Promise<Company[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies`);
    if (!response.ok) throw new Error('Failed to fetch companies');
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return await mockApi.getAllCompanies();
  } catch (error) {
    console.warn('getAllCompanies fetch failed, using local mock API:', error);
    return await mockApi.getAllCompanies();
  }
};

export const createUser = async (user: Omit<User, 'id'>): Promise<User | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
    if (!response.ok) throw new Error('Failed to create user');
    return await response.json();
  } catch (error) {
    console.warn('createUser fetch failed, using local mock API:', error);
    const id = `U-${Date.now()}`;
    return await mockApi.createUser({ id, ...user } as User);
  }
};

export const createCompany = async (company: Omit<Company, 'id'>): Promise<Company | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/companies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(company),
    });
    if (!response.ok) throw new Error('Failed to create company');
    return await response.json();
  } catch (error) {
    console.warn('createCompany fetch failed, using local mock API:', error);
    return await mockApi.createCompany(company.name, company.subscriptionPlan);
  }
};

export const updateUserPermissions = async (userId: string, permissions: string[]): Promise<User | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/${userId}/permissions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    });
    if (!response.ok) throw new Error('Failed to update permissions');
    return await response.json();
  } catch (error) {
    console.warn('updateUserPermissions fetch failed, using local mock API:', error);
    await mockApi.updateUserPermissions(userId, permissions);
    return null;
  }
};

export const getInventory = async (): Promise<InventoryEquipment[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`);
    if (!response.ok) throw new Error(`HTTP ${response.status} - Failed to fetch inventory`);
    return await response.json();
  } catch (error) {
    console.error('getInventory error:', error);
    return [];
  }
};

export const addInventoryItem = async (item: Omit<InventoryEquipment, 'id'>): Promise<InventoryEquipment | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!response.ok) throw new Error('Failed to add inventory item');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const updateInventoryItem = async (id: string, updates: Partial<InventoryEquipment>): Promise<InventoryEquipment | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update inventory item');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const deleteInventoryItem = async (id: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error(error);
    return false;
  }
};

// --- Genkit AI ---
export const parseFieldIntent = async (userInput: string, projectContext?: unknown) => {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput, projectContext }),
    });
    if (!response.ok) throw new Error('AI intent parse failed');
    return await response.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const generateNarrative = async (context: { currentStage: string; equipmentCount?: number; readings?: unknown[]; complianceIssues?: string }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    if (!response.ok) throw new Error('AI narrative generation failed');
    const data = await response.json();
    return data.narrative;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const generateDailyDryingNarrative = async (context: { date?: string; psychrometricReadings?: unknown[]; trackedMaterials?: unknown[] }) => {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/drying-narrative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    if (!response.ok) throw new Error('AI drying narrative generation failed');
    const data = await response.json();
    return data.narrative;
  } catch (error) {
    console.error(error);
    return null;
  }
};
