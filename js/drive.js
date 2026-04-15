/**
 * drive.js — Google Drive "appDataFolder" integration.
 *
 * The drive.appdata scope gives the extension a hidden folder on the user's
 * Drive. It's invisible in the Drive UI but persists across devices and
 * browsers where the user is signed in.
 *
 * All functions return null / throw on auth failure — callers should handle
 * gracefully and fall back to local storage.
 */

const FILE_NAME = 'timesheets-data.json';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Returns true if a real OAuth client ID has been configured in the manifest.
 * Prevents spurious auth errors when the placeholder is still in place.
 */
export function isDriveConfigured() {
  const clientId = chrome.runtime.getManifest()?.oauth2?.client_id || '';
  return clientId.length > 0 && !clientId.startsWith('YOUR_CLIENT_ID');
}

/**
 * Get an OAuth token interactively (shows Google sign-in if needed).
 * Returns the token string or null if unconfigured / user declines.
 */
export async function getAuthToken(interactive = false) {
  if (!isDriveConfigured()) return null;

  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        // Only log if interactive — silent background checks are expected to fail
        if (interactive) {
          console.warn('Drive auth:', chrome.runtime.lastError.message);
        }
        resolve(null);
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Remove the cached token (forces re-auth next time).
 */
export async function revokeToken() {
  const token = await getAuthToken(false);
  if (!token) return;
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

/**
 * Fetch the signed-in user's basic profile.
 * Returns { name, email, picture } or null.
 */
export async function getUserInfo() {
  const token = await getAuthToken(false);
  if (!token) return null;
  try {
    const res = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { name: data.name, email: data.email, picture: data.picture };
  } catch {
    return null;
  }
}


/**
 * Find the Drive file ID for our data file, or null if it doesn't exist yet.
 */
export async function findDataFileId() {
  const token = await getAuthToken(false);
  if (!token) return null;
  try {
    const url =
      `${DRIVE_FILES_URL}?spaces=appDataFolder` +
      `&q=name='${FILE_NAME}'&fields=files(id)`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Download the data file from Drive. Returns parsed JSON or null.
 */
export async function downloadData(fileId) {
  const token = await getAuthToken(false);
  if (!token || !fileId) return null;
  try {
    const res = await fetch(`${DRIVE_FILES_URL}/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upload (create or update) the data file on Drive.
 * Returns the file ID on success, null on failure.
 */
export async function uploadData(data, fileId = null) {
  const token = await getAuthToken(false);
  if (!token) return null;

  const body = JSON.stringify(data);

  try {
    if (fileId) {
      // Update existing file
      const res = await fetch(
        `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body,
        }
      );
      return res.ok ? fileId : null;
    } else {
      // Create new file in appDataFolder
      const metadata = {
        name: FILE_NAME,
        parents: ['appDataFolder'],
      };

      const formData = new FormData();
      formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' })
      );
      formData.append('file', new Blob([body], { type: 'application/json' }));

      const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.id ?? null;
    }
  } catch {
    return null;
  }
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

/**
 * High-level sync: pull from Drive → merge → push back.
 * Returns { success, fileId } so the caller can persist the fileId.
 */
export async function syncWithDrive(localData, storedFileId = null) {
  try {
    // Resolve the file ID
    let fileId = storedFileId ?? (await findDataFileId());

    // Pull existing data
    const remote = fileId ? await downloadData(fileId) : null;

    let dataToUpload = localData;

    if (remote) {
      const localTime = new Date(localData.lastModified || 0).getTime();
      const remoteTime = new Date(remote.lastModified || 0).getTime();
      // Use the newer copy as the source of truth
      dataToUpload = remoteTime > localTime ? remote : localData;
    }

    // Push
    const newFileId = await uploadData(dataToUpload, fileId);

    return {
      success: !!newFileId,
      fileId: newFileId || fileId,
      data: dataToUpload,
    };
  } catch {
    return { success: false, fileId: storedFileId, data: localData };
  }
}
