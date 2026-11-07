import { GoogleAuthProvider, signInWithPopup, User, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

// In-memory token cache (never persisted to localStorage or sessionStorage per security requirements)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const initWorkspaceAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token might not be in cache yet (e.g. reload), user will click Sign In to grant Workspace token
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignInWorkspace = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    WORKSPACE_SCOPES.forEach(scope => provider.addScope(scope));
    // Request offline access prompt if needed
    provider.setCustomParameters({
      prompt: 'consent',
      access_type: 'online'
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to acquire Google Workspace access token');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Workspace Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logoutWorkspace = async () => {
  cachedAccessToken = null;
  await auth.signOut();
};

// ==========================================
// GOOGLE DRIVE API CLIENT
// ==========================================

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  parents?: string[];
}

export const listDriveFiles = async (query?: string, pageSize = 30): Promise<DriveFileItem[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  let q = "trashed = false";
  if (query) {
    q += ` and (${query})`;
  }

  const fields = 'files(id, name, mimeType, size, modifiedTime, webViewLink, webContentLink, iconLink, thumbnailLink, parents)';
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=${encodeURIComponent(fields)}&q=${encodeURIComponent(q)}&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Google Drive API error (${res.status})`);
  }

  const data = await res.json();
  return data.files || [];
};

export const createDriveFolder = async (folderName: string, parentFolderId?: string): Promise<DriveFileItem> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create folder (${res.status})`);
  }

  return await res.json();
};

export const uploadFileToDrive = async (
  file: File | Blob,
  fileName: string,
  mimeType: string,
  folderId?: string
): Promise<DriveFileItem> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: fileName,
    mimeType,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const fileReader = new FileReader();
  const fileDataPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    fileReader.onload = () => resolve(fileReader.result as ArrayBuffer);
    fileReader.onerror = reject;
    fileReader.readAsArrayBuffer(file);
  });

  const fileBytes = await fileDataPromise;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaPart = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const encoder = new TextEncoder();
  const metadataBuffer = encoder.encode(metadataPart);
  const mediaBuffer = encoder.encode(mediaPart);
  const closeBuffer = encoder.encode(closeDelimiter);

  const combined = new Uint8Array(metadataBuffer.length + mediaBuffer.length + fileBytes.byteLength + closeBuffer.length);
  combined.set(metadataBuffer, 0);
  combined.set(mediaBuffer, metadataBuffer.length);
  combined.set(new Uint8Array(fileBytes), metadataBuffer.length + mediaBuffer.length);
  combined.set(closeBuffer, metadataBuffer.length + mediaBuffer.length + fileBytes.byteLength);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,webViewLink,webContentLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to upload file to Google Drive (${res.status})`);
  }

  return await res.json();
};

export const deleteDriveFile = async (fileId: string): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to delete file from Google Drive (${res.status})`);
  }
};

// ==========================================
// GMAIL API CLIENT
// ==========================================

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  labels?: string[];
  bodyText?: string;
}

export const getGmailProfile = async (): Promise<{ emailAddress: string; messagesTotal: number }> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch Gmail profile (${res.status})`);
  }

  return await res.json();
};

export const listGmailMessages = async (query?: string, maxResults = 25): Promise<GmailMessageSummary[]> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`;
  if (query) {
    url += `&q=${encodeURIComponent(query)}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to list Gmail messages (${res.status})`);
  }

  const data = await res.json();
  const messageItems: { id: string; threadId: string }[] = data.messages || [];

  if (messageItems.length === 0) return [];

  // Fetch details for each message concurrently (up to 15)
  const detailPromises = messageItems.slice(0, 15).map(async (item) => {
    try {
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!msgRes.ok) return null;
      const msgData = await msgRes.json();
      const headers: GmailMessageHeader[] = msgData.payload?.headers || [];
      const getH = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      return {
        id: msgData.id,
        threadId: msgData.threadId,
        snippet: msgData.snippet,
        internalDate: msgData.internalDate,
        subject: getH('Subject') || '(No Subject)',
        from: getH('From'),
        to: getH('To'),
        date: getH('Date'),
        labels: msgData.labelIds,
      } as GmailMessageSummary;
    } catch {
      return null;
    }
  });

  const detailed = await Promise.all(detailPromises);
  return detailed.filter((m): m is GmailMessageSummary => m !== null);
};

export const getGmailMessageFull = async (id: string): Promise<GmailMessageSummary> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to fetch email (${res.status})`);
  }

  const msgData = await res.json();
  const headers: GmailMessageHeader[] = msgData.payload?.headers || [];
  const getH = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  interface GmailPartPayload {
    mimeType?: string;
    body?: { data?: string; size?: number };
    parts?: GmailPartPayload[];
  }

  // Extract body text from parts
  let bodyText = '';
  const extractText = (payload?: GmailPartPayload | null) => {
    if (!payload) return;
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      bodyText += decodeBase64Url(payload.body.data);
    } else if (payload.parts) {
      payload.parts.forEach(extractText);
    } else if (payload.body?.data) {
      bodyText += decodeBase64Url(payload.body.data);
    }
  };

  extractText(msgData.payload);

  return {
    id: msgData.id,
    threadId: msgData.threadId,
    snippet: msgData.snippet,
    internalDate: msgData.internalDate,
    subject: getH('Subject') || '(No Subject)',
    from: getH('From'),
    to: getH('To'),
    date: getH('Date'),
    labels: msgData.labelIds,
    bodyText: bodyText || msgData.snippet || '',
  };
};

const decodeBase64Url = (base64UrlStr: string): string => {
  try {
    let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return '';
  }
};

const encodeBase64Url = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  replyTo?: string;
}

export const sendGmailMessage = async (params: SendEmailParams): Promise<{ id: string; threadId: string }> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  const emailLines: string[] = [
    `To: ${params.to}`,
  ];
  if (params.cc) {
    emailLines.push(`Cc: ${params.cc}`);
  }
  if (params.replyTo) {
    emailLines.push(`Reply-To: ${params.replyTo}`);
  }
  emailLines.push(`Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(params.subject)))}?=`);
  emailLines.push('Content-Type: text/plain; charset=UTF-8');
  emailLines.push('MIME-Version: 1.0');
  emailLines.push('');
  emailLines.push(params.body);

  const raw = encodeBase64Url(emailLines.join('\r\n'));

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to send email via Gmail (${res.status})`);
  }

  return await res.json();
};

export const deleteGmailMessage = async (messageId: string): Promise<void> => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated with Google Workspace. Please sign in with Google.');

  // Trashing is safer than permanent delete
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to trash email (${res.status})`);
  }
};
