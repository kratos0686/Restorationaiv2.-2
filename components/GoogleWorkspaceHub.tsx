import React, { useState, useEffect, useCallback } from 'react';
import { 
  Folder, FileText, Image as ImageIcon, FileSpreadsheet, Trash2, 
  Upload, ExternalLink, RefreshCw, Mail, Send, Search, 
  CheckCircle, AlertCircle, HardDrive, Inbox, AlertTriangle,
  FilePlus, Shield
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Project } from '../types';
import { 
  getAccessToken, 
  googleSignInWorkspace, 
  listDriveFiles, 
  uploadFileToDrive, 
  createDriveFolder, 
  deleteDriveFile, 
  DriveFileItem,
  listGmailMessages,
  getGmailMessageFull,
  sendGmailMessage,
  deleteGmailMessage,
  GmailMessageSummary,
  getGmailProfile
} from '../services/googleWorkspace';
import { EventBus } from '../services/EventBus';

interface GoogleWorkspaceHubProps {
  project?: Project | null;
  onBack?: () => void;
}

export const GoogleWorkspaceHub: React.FC<GoogleWorkspaceHubProps> = ({ project: propProject, onBack }) => {
  const { currentUser, setAccessToken } = useAppContext();
  const [activeSubTab, setActiveSubTab] = useState<'drive' | 'gmail'>('drive');
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [gmailProfile, setGmailProfile] = useState<{ emailAddress: string; messagesTotal: number } | null>(null);

  // Drive state
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'pdf' | 'image' | 'sheet' | 'doc'>('all');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Gmail state
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [isGmailLoading, setIsGmailLoading] = useState(false);
  const [gmailSearch, setGmailSearch] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageSummary | null>(null);
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);

  // Compose State
  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Mandatory Confirmation Dialog State for Destructive/Mutating Operations
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel: string;
    isDestructive: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionLabel: 'Confirm',
    isDestructive: false,
    onConfirm: async () => {},
  });

  // Verify access token
  const checkToken = useCallback(async () => {
    const token = await getAccessToken();
    setHasToken(!!token);
    if (token) {
      try {
        const profile = await getGmailProfile();
        setGmailProfile(profile);
      } catch (err) {
        console.warn('Could not fetch Gmail profile:', err);
      }
    }
  }, []);

  useEffect(() => {
    checkToken();
  }, [checkToken]);

  // Load Drive files
  const loadDriveFiles = useCallback(async () => {
    setIsDriveLoading(true);
    try {
      let query = '';
      if (fileTypeFilter === 'pdf') query = "mimeType = 'application/pdf'";
      else if (fileTypeFilter === 'image') query = "mimeType contains 'image/'";
      else if (fileTypeFilter === 'sheet') query = "mimeType contains 'spreadsheet' or mimeType = 'text/csv'";
      else if (fileTypeFilter === 'doc') query = "mimeType contains 'document' or mimeType = 'text/plain'";

      if (driveSearch.trim()) {
        const nameQuery = `name contains '${driveSearch.replace(/'/g, "\\'")}'`;
        query = query ? `${query} and ${nameQuery}` : nameQuery;
      }

      const files = await listDriveFiles(query || undefined, 30);
      setDriveFiles(files);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error loading Drive files:', err);
      EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, errorMsg, 'error');
    } finally {
      setIsDriveLoading(false);
    }
  }, [driveSearch, fileTypeFilter]);

  // Load Gmail messages
  const loadGmailMessages = useCallback(async () => {
    setIsGmailLoading(true);
    try {
      let q = gmailSearch.trim();
      // If project provided and no search specified, default search to project or client
      if (!q && propProject) {
        q = propProject.client || '';
      }
      const msgs = await listGmailMessages(q || undefined, 20);
      setMessages(msgs);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Error loading Gmail messages:', err);
      EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, errorMsg, 'error');
    } finally {
      setIsGmailLoading(false);
    }
  }, [gmailSearch, propProject]);

  useEffect(() => {
    if (hasToken) {
      if (activeSubTab === 'drive') {
        loadDriveFiles();
      } else {
        loadGmailMessages();
      }
    }
  }, [hasToken, activeSubTab, loadDriveFiles, loadGmailMessages]);

  // Google Sign-In with Workspace Scopes
  const handleConnectGoogle = async () => {
    setIsAuthenticating(true);
    try {
      const res = await googleSignInWorkspace();
      if (res?.accessToken) {
        setAccessToken(res.accessToken);
        setHasToken(true);
        const profile = await getGmailProfile();
        setGmailProfile(profile);
        EventBus.publish('com.restorationai.workspace.connected', { email: profile.emailAddress }, undefined, 'Google Drive & Gmail Connected', 'success');
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Auth error:', err);
      EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, 'Failed to connect Google Workspace', 'error');
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Upload file to Drive
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(`Uploading ${file.name} to Google Drive...`);
    try {
      await uploadFileToDrive(file, file.name, file.type || 'application/octet-stream');
      EventBus.publish('com.restorationai.drive.uploaded', { name: file.name }, undefined, `Uploaded "${file.name}" to Google Drive`, 'success');
      await loadDriveFiles();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Upload error:', err);
      EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, `Upload failed: ${errorMsg}`, 'error');
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
      e.target.value = '';
    }
  };

  // Create Project Folder in Drive
  const handleCreateProjectFolder = async () => {
    const folderName = propProject 
      ? `RestorationAI - ${propProject.client} - ${propProject.address}` 
      : `RestorationAI - Job Files ${new Date().toLocaleDateString()}`;

    setIsUploading(true);
    setUploadStatus(`Creating folder "${folderName}" in Google Drive...`);
    try {
      await createDriveFolder(folderName);
      EventBus.publish('com.restorationai.drive.folder_created', { name: folderName }, undefined, `Created Drive Folder: ${folderName}`, 'success');
      await loadDriveFiles();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Create folder error:', err);
      EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, `Folder creation failed: ${errorMsg}`, 'error');
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
    }
  };

  // Export Project Summary to Google Drive
  const handleExportSummaryToDrive = async () => {
    if (!propProject) return;

    const summaryContent = `RESTORATION-AI LOSS FILE SUMMARY
==================================================
Project / Client: ${propProject.client}
Loss Address: ${propProject.address}
Date of Loss: ${propProject.startDate || 'N/A'}
Stage: ${propProject.stage || 'In Progress'}
Water Category: ${propProject.waterCategory || 'CAT_1'}
Loss Class: ${propProject.lossClass || 'CLASS_1'}
Technician / Company: ${currentUser?.name || 'Field Technician'}

ROOM SUMMARY:
${propProject.rooms?.map((r, i) => `  ${i + 1}. ${r.name} (${r.dimensions?.length || 0}x${r.dimensions?.width || 0} ft)`).join('\n') || '  No rooms recorded'}

EQUIPMENT DEPLOYED:
${propProject.equipment?.map(eq => `  - ${eq.type} (ID: ${eq.id}) | Status: ${eq.status}`).join('\n') || '  No equipment placed'}

GENERATED: ${new Date().toLocaleString()}
COMPLIANCE: IICRC S500 / S520 Standards Protocol
`;

    const blob = new Blob([summaryContent], { type: 'text/plain' });
    const fileName = `Loss_Summary_${propProject.client.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;

    setIsUploading(true);
    setUploadStatus(`Exporting loss summary to Google Drive...`);
    try {
      await uploadFileToDrive(blob, fileName, 'text/plain');
      EventBus.publish('com.restorationai.drive.uploaded', { name: fileName }, undefined, `Exported summary to Google Drive!`, 'success');
      await loadDriveFiles();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('Export error:', err);
      EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, `Export failed: ${errorMsg}`, 'error');
    } finally {
      setIsUploading(false);
      setUploadStatus(null);
    }
  };

  // MANDATORY USER CONFIRMATION: Delete File from Drive
  const promptDeleteDriveFile = (file: DriveFileItem) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Google Drive File',
      description: `Are you sure you want to permanently delete "${file.name}" from your Google Drive? This action cannot be undone.`,
      actionLabel: 'Delete File',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDriveFile(file.id);
          EventBus.publish('com.restorationai.drive.deleted', { id: file.id, name: file.name }, undefined, `Deleted "${file.name}" from Google Drive`, 'info');
          await loadDriveFiles();
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('Delete file error:', err);
          EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, `Delete failed: ${errorMsg}`, 'error');
        }
      },
    });
  };

  // View full message
  const handleSelectMessage = async (msg: GmailMessageSummary) => {
    setIsLoadingMessage(true);
    try {
      const full = await getGmailMessageFull(msg.id);
      setSelectedMessage(full);
    } catch (err: unknown) {
      console.error('Error fetching message details:', err);
      setSelectedMessage(msg);
    } finally {
      setIsLoadingMessage(false);
    }
  };

  // Pre-fill email templates
  const applyEmailTemplate = (templateType: 'drying' | 'adjuster' | 'completion') => {
    const clientName = propProject?.client || 'Property Owner';
    const address = propProject?.address || 'Site Location';
    const techName = currentUser?.name || 'Lead Mitigation Specialist';

    if (templateType === 'drying') {
      setComposeSubject(`Daily Drying & Psychrometric Progress Update - ${clientName} (${address})`);
      setComposeBody(`Hello,

Please find the daily water mitigation & psychrometric drying update for the project at ${address}:

Job Status: Active Drying & Chamber Stabilization
Current Mitigation Stage: ${propProject?.stage || 'Monitoring'}
Water Loss Category: ${propProject?.waterCategory || 'CAT 1 - Clean'}
Loss Classification: ${propProject?.lossClass || 'CLASS 2'}

Drying Chamber Performance:
- Target structural equilibrium achieved across initial dry zones.
- Environmental readings (Temperature & GPP) are strictly tracking within IICRC S500 standard psychrometric parameters.
- Equipment is operating at full efficiency to protect unaffected assemblies.

Our mitigation team will return tomorrow for scheduled daily meter readings. If you have any questions, please reply directly to this notice.

Sincerely,
${techName}
RestorationAI Water Mitigation Operations`);
    } else if (templateType === 'adjuster') {
      setComposeSubject(`Inspection Report & Scope Documentation - Claim File - ${clientName}`);
      setComposeBody(`Dear Adjuster / Claims Team,

Attached is our formal field inspection notification and scope documentation for the water damage loss at:
Insured / Client: ${clientName}
Property Address: ${address}
Loss Class: ${propProject?.lossClass || 'CLASS 2'} | Category: ${propProject?.waterCategory || 'CAT 1'}

Scope Summary:
- Initial moisture mapping and thermal inspection completed.
- Containment established where required in compliance with ANSI/IICRC S500/S520.
- Detailed line-item documentation and photo logs have been archived.

Please let us know if additional dry logs or psychrometric grain depression curves are required for your file.

Respectfully,
${techName}
RestorationAI Field Services`);
    } else if (templateType === 'completion') {
      setComposeSubject(`Certificate of Structural Dry Standard Attainment - ${clientName}`);
      setComposeBody(`To Whom It May Concern,

This letter serves as official verification that the structural drying process for the property at ${address} has met standard equilibrium drying criteria in accordance with ANSI/IICRC S500 Standards.

Summary:
- Affected framing, subflooring, and dryable drywall have reached verified dry standards against unaffected baseline controls.
- Remediation equipment has been safely powered down and scheduled for demobilization.
- Clearance documentation is finalized and ready for reconstruction sign-off.

Thank you for your cooperation throughout the mitigation process.

Best regards,
${techName}
RestorationAI Mitigation Management`);
    }
  };

  // MANDATORY USER CONFIRMATION: Send Email via Gmail
  const handleInitiateSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      EventBus.publish('com.restorationai.workspace.warning', {}, undefined, 'Please enter recipient, subject, and message body.', 'warning');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Sending Email via Gmail',
      description: `You are about to send an email to "${composeTo}" from your authorized Gmail account (${gmailProfile?.emailAddress || currentUser?.email || 'connected account'}).
      
Subject: "${composeSubject}"
      
Are you sure you want to proceed?`,
      actionLabel: 'Send Email Now',
      isDestructive: false,
      onConfirm: async () => {
        setIsSending(true);
        try {
          await sendGmailMessage({
            to: composeTo.trim(),
            subject: composeSubject.trim(),
            body: composeBody,
            cc: composeCc.trim() || undefined,
          });
          EventBus.publish('com.restorationai.gmail.sent', { to: composeTo, subject: composeSubject }, undefined, `Email sent to ${composeTo}`, 'success');
          setShowCompose(false);
          setComposeTo('');
          setComposeCc('');
          setComposeSubject('');
          setComposeBody('');
          await loadGmailMessages();
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('Send email error:', err);
          EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, `Failed to send email: ${errorMsg}`, 'error');
        } finally {
          setIsSending(false);
        }
      },
    });
  };

  // MANDATORY USER CONFIRMATION: Move Email to Trash
  const promptTrashEmail = (msg: GmailMessageSummary) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Move Email to Trash',
      description: `Are you sure you want to move this email ("${msg.subject}") to the trash in your Gmail account?`,
      actionLabel: 'Move to Trash',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteGmailMessage(msg.id);
          EventBus.publish('com.restorationai.gmail.trashed', { id: msg.id }, undefined, 'Email moved to Trash', 'info');
          if (selectedMessage?.id === msg.id) {
            setSelectedMessage(null);
          }
          await loadGmailMessages();
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('Trash email error:', err);
          EventBus.publish('com.restorationai.workspace.error', { error: errorMsg }, undefined, `Failed to trash email: ${errorMsg}`, 'error');
        }
      },
    });
  };

  const formatFileSize = (bytesStr?: string) => {
    if (!bytesStr) return '-';
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('folder')) return <Folder className="text-amber-400" size={20} />;
    if (mimeType.includes('pdf')) return <FileText className="text-red-400" size={20} />;
    if (mimeType.includes('image')) return <ImageIcon className="text-emerald-400" size={20} />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return <FileSpreadsheet className="text-teal-400" size={20} />;
    return <FileText className="text-blue-400" size={20} />;
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <HardDrive size={22} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Google Workspace Hub</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Drive &amp; Gmail
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {propProject ? `Integrated with: ${propProject.client}` : 'Manage restoration files, inspection documents & client communications'}
            </p>
          </div>
        </div>

        {/* Top Controls: Auth status & Tabs */}
        <div className="flex items-center space-x-3">
          {hasToken ? (
            <div className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400">
                {gmailProfile?.emailAddress || currentUser?.email || 'Connected'}
              </span>
            </div>
          ) : (
            <button
              onClick={handleConnectGoogle}
              disabled={isAuthenticating}
              className="flex items-center space-x-2 bg-white text-slate-900 hover:bg-slate-100 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            >
              <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" alt="Google" className="w-4 h-4" />
              <span>{isAuthenticating ? 'Connecting...' : 'Connect Google Workspace'}</span>
            </button>
          )}

          {/* Sub-Tab Switcher */}
          <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveSubTab('drive')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'drive'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <HardDrive size={14} />
              <span>Google Drive</span>
            </button>
            <button
              onClick={() => setActiveSubTab('gmail')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeSubTab === 'gmail'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Mail size={14} />
              <span>Gmail</span>
            </button>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-medium text-slate-300 transition-colors"
            >
              Back to Job
            </button>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {!hasToken ? (
          <div className="max-w-xl mx-auto my-12 bg-slate-900/60 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-xl shadow-2xl">
            <div className="w-16 h-16 bg-gradient-to-tr from-blue-500/20 to-indigo-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 text-blue-400 shadow-inner">
              <HardDrive size={32} />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Connect Google Workspace</h2>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Grant permissions to access and upload restoration inspection files, moisture reports, and photo logs to Google Drive, and dispatch status updates, drying logs, and certificates of completion to clients and insurance adjusters through Gmail.
            </p>

            <button
              onClick={handleConnectGoogle}
              disabled={isAuthenticating}
              className="w-full bg-white text-slate-900 h-14 rounded-2xl font-bold text-sm flex items-center justify-center space-x-3 shadow-2xl hover:bg-slate-50 active:scale-[0.98] transition-all ring-1 ring-slate-200"
            >
              <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5" alt="Google" />
              <span>{isAuthenticating ? 'Connecting to Google...' : 'Sign in with Google'}</span>
            </button>

            <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-2 gap-4 text-left">
              <div className="flex items-start space-x-2.5">
                <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-400 leading-tight">Google Drive project file storage and cloud backup</span>
              </div>
              <div className="flex items-start space-x-2.5">
                <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-400 leading-tight">Direct Gmail correspondence with clients and adjusters</span>
              </div>
            </div>
          </div>
        ) : activeSubTab === 'drive' ? (
          /* ========================================================= */
          /* GOOGLE DRIVE CONTENT                                      */
          /* ========================================================= */
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Project Context Quick Actions Bar */}
            {propProject && (
              <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-slate-900/60 border border-blue-500/20 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <Folder className="text-blue-400" size={18} />
                    <h3 className="text-sm font-bold text-white">Project Cloud Storage: {propProject.client}</h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    Job Address: {propProject.address} • Stage: {propProject.stage || 'In Progress'}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCreateProjectFolder}
                    disabled={isUploading}
                    className="flex items-center space-x-2 bg-blue-600/80 hover:bg-blue-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <FilePlus size={15} />
                    <span>Create Job Folder in Drive</span>
                  </button>

                  <button
                    onClick={handleExportSummaryToDrive}
                    disabled={isUploading}
                    className="flex items-center space-x-2 bg-indigo-600/80 hover:bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <Upload size={15} />
                    <span>Export Loss Summary to Drive</span>
                  </button>
                </div>
              </div>
            )}

            {/* Drive Explorer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 border border-white/5 p-4 rounded-2xl">
              {/* Search */}
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={driveSearch}
                  onChange={(e) => setDriveSearch(e.target.value)}
                  placeholder="Search files in Google Drive..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center space-x-1 bg-black/30 p-1 rounded-xl border border-white/5">
                {(['all', 'pdf', 'image', 'sheet', 'doc'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setFileTypeFilter(filter)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                      fileTypeFilter === filter
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Upload & Refresh */}
              <div className="flex items-center space-x-2">
                <label className="cursor-pointer flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95">
                  <Upload size={14} />
                  <span>Upload File</span>
                  <input type="file" onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                </label>

                <button
                  onClick={loadDriveFiles}
                  disabled={isDriveLoading}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 transition-colors"
                  title="Refresh Files"
                >
                  <RefreshCw size={16} className={isDriveLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {uploadStatus && (
              <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2.5 rounded-xl text-xs flex items-center space-x-2 animate-pulse">
                <RefreshCw size={14} className="animate-spin" />
                <span>{uploadStatus}</span>
              </div>
            )}

            {/* File List Grid / Table */}
            {isDriveLoading ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center space-y-3">
                <RefreshCw size={24} className="animate-spin text-blue-400" />
                <span className="text-xs">Loading files from Google Drive...</span>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="py-16 text-center bg-slate-900/20 border border-dashed border-white/10 rounded-3xl p-8">
                <Folder size={36} className="mx-auto text-slate-600 mb-3" />
                <h4 className="text-sm font-bold text-white mb-1">No files found in Google Drive</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Upload damage photos, scope estimates, or export the project summary directly to Drive.
                </p>
                <label className="cursor-pointer inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all">
                  <Upload size={14} />
                  <span>Upload First File</span>
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {driveFiles.map((file) => (
                  <div
                    key={file.id}
                    className="bg-slate-900/50 border border-white/5 hover:border-blue-500/30 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-lg group"
                  >
                    <div className="flex items-start space-x-3 mb-3">
                      <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 shrink-0">
                        {getFileIcon(file.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white truncate" title={file.name}>
                          {file.name}
                        </h4>
                        <div className="flex items-center space-x-2 mt-1 text-[11px] text-slate-400">
                          <span>{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span>{file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : 'Recent'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center space-x-1.5 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <span>Open in Drive</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>

                      <button
                        onClick={() => promptDeleteDriveFile(file)}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        title="Delete file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================= */
          /* GMAIL CONTENT                                             */
          /* ========================================================= */
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Gmail Controls & Compose Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 border border-white/5 p-4 rounded-2xl">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={gmailSearch}
                  onChange={(e) => setGmailSearch(e.target.value)}
                  placeholder={propProject ? `Search emails for ${propProject.client}...` : 'Search Gmail inbox...'}
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setShowCompose(true);
                    if (propProject) {
                      applyEmailTemplate('drying');
                    }
                  }}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <Send size={14} />
                  <span>Compose Email</span>
                </button>

                <button
                  onClick={loadGmailMessages}
                  disabled={isGmailLoading}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-300 transition-colors"
                  title="Refresh Inbox"
                >
                  <RefreshCw size={16} className={isGmailLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Compose Drawer / Modal */}
            {showCompose && (
              <div className="bg-slate-900/90 border border-blue-500/30 rounded-3xl p-6 shadow-2xl backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-2">
                    <Mail size={18} className="text-blue-400" />
                    <h3 className="text-sm font-bold text-white">Compose Restoration Email</h3>
                  </div>

                  {/* Template Picker */}
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400 font-semibold">Templates:</span>
                    <button
                      type="button"
                      onClick={() => applyEmailTemplate('drying')}
                      className="px-2.5 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-[11px] font-bold"
                    >
                      Drying Progress
                    </button>
                    <button
                      type="button"
                      onClick={() => applyEmailTemplate('adjuster')}
                      className="px-2.5 py-1 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-[11px] font-bold"
                    >
                      Scope Submission
                    </button>
                    <button
                      type="button"
                      onClick={() => applyEmailTemplate('completion')}
                      className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-[11px] font-bold"
                    >
                      Completion Cert
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCompose(false)}
                      className="text-slate-400 hover:text-white px-2 text-xs ml-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                <form onSubmit={handleInitiateSend} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">To (Recipient Email)*</label>
                      <input
                        type="email"
                        required
                        value={composeTo}
                        onChange={(e) => setComposeTo(e.target.value)}
                        placeholder="adjuster@insurance.com or homeowner@email.com"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">Cc (Optional)</label>
                      <input
                        type="text"
                        value={composeCc}
                        onChange={(e) => setComposeCc(e.target.value)}
                        placeholder="pm@restorationcompany.com"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Subject*</label>
                    <input
                      type="text"
                      required
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      placeholder="Project Status / Psychrometric Update"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">Message Body*</label>
                    <textarea
                      required
                      rows={8}
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      placeholder="Type your formal restoration correspondence here..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                      <Shield size={14} className="text-blue-400" />
                      <span>Emails are dispatched through your authenticated Google Account</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setShowCompose(false)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-bold text-slate-300"
                      >
                        Discard
                      </button>
                      <button
                        type="submit"
                        disabled={isSending}
                        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                      >
                        <Send size={14} />
                        <span>{isSending ? 'Sending...' : 'Review & Send'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Email Split View: Message List + Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Message List */}
              <div className={`${selectedMessage ? 'lg:col-span-5' : 'lg:col-span-12'} space-y-3`}>
                <div className="flex items-center justify-between px-2 text-xs font-bold text-slate-400">
                  <div className="flex items-center space-x-2">
                    <Inbox size={14} />
                    <span>Recent Messages ({messages.length})</span>
                  </div>
                  {isGmailLoading && <RefreshCw size={12} className="animate-spin text-blue-400" />}
                </div>

                {isGmailLoading ? (
                  <div className="py-12 text-center text-slate-500 flex flex-col items-center space-y-2">
                    <RefreshCw size={20} className="animate-spin text-blue-400" />
                    <span className="text-xs">Fetching inbox...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 bg-slate-900/20 border border-dashed border-white/10 rounded-2xl p-6">
                    <Mail size={32} className="mx-auto text-slate-600 mb-2" />
                    <p className="text-xs text-slate-400">No emails matching query found.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((msg) => {
                      const isSelected = selectedMessage?.id === msg.id;
                      return (
                        <div
                          key={msg.id}
                          onClick={() => handleSelectMessage(msg)}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-950/40 border-blue-500/50 shadow-md'
                              : 'bg-slate-900/40 border-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-white truncate max-w-[200px]">
                              {msg.from || 'Unknown Sender'}
                            </span>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {msg.date ? new Date(msg.date).toLocaleDateString() : ''}
                            </span>
                          </div>
                          <h4 className="text-xs font-semibold text-blue-300 truncate mb-1">
                            {msg.subject || '(No Subject)'}
                          </h4>
                          <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {msg.snippet || 'No preview available'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Message Details Preview */}
              {selectedMessage && (
                <div className="lg:col-span-7 bg-slate-900/60 border border-white/10 rounded-3xl p-6 flex flex-col h-full backdrop-blur-xl">
                  {isLoadingMessage ? (
                    <div className="py-24 text-center text-slate-500 flex flex-col items-center space-y-3">
                      <RefreshCw size={24} className="animate-spin text-blue-400" />
                      <span className="text-xs">Loading email content...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between border-b border-white/10 pb-4 mb-4">
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-white">
                            {selectedMessage.subject || '(No Subject)'}
                          </h3>
                          <div className="text-xs text-slate-400">
                            <span className="font-semibold text-slate-300">From:</span> {selectedMessage.from}
                          </div>
                          {selectedMessage.to && (
                            <div className="text-xs text-slate-400">
                              <span className="font-semibold text-slate-300">To:</span> {selectedMessage.to}
                            </div>
                          )}
                          {selectedMessage.date && (
                            <div className="text-[10px] text-slate-500">
                              {new Date(selectedMessage.date).toLocaleString()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              setShowCompose(true);
                              setComposeTo(selectedMessage.from?.replace(/^.*<([^>]+)>.*$/, '$1') || selectedMessage.from || '');
                              setComposeSubject(`Re: ${selectedMessage.subject || ''}`);
                              setComposeBody(`\n\n--- Original Message ---\n${selectedMessage.bodyText || selectedMessage.snippet || ''}`);
                            }}
                            className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white rounded-xl text-xs font-bold"
                          >
                            Reply
                          </button>
                          <button
                            onClick={() => promptTrashEmail(selectedMessage)}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                            title="Move to Trash"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            onClick={() => setSelectedMessage(null)}
                            className="text-slate-400 hover:text-white p-1 text-sm font-bold"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed bg-black/20 p-4 rounded-2xl border border-white/5">
                        {selectedMessage.bodyText || selectedMessage.snippet || 'No message body.'}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* MANDATORY USER CONFIRMATION MODAL FOR DESTRUCTIVE OPERATIONS  */}
      {/* ============================================================= */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                  confirmDialog.isDestructive
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}
              >
                {confirmDialog.isDestructive ? <AlertTriangle size={20} /> : <AlertCircle size={20} />}
              </div>
              <h3 className="text-base font-bold text-white">{confirmDialog.title}</h3>
            </div>

            <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
              {confirmDialog.description}
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const onConf = confirmDialog.onConfirm;
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                  await onConf();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 ${
                  confirmDialog.isDestructive
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {confirmDialog.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleWorkspaceHub;
