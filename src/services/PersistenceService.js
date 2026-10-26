/**
 * PersistenceService.js
 * Saves and restores Zine-ify workspace state across browser refreshes.
 * Metadata is stored in localStorage; binary page Blobs are stored in IndexedDB.
 */

const STORAGE_META_KEY = 'zine-ify-session-v1';
const IDB_NAME = 'zine-ify-session-db';
const IDB_VERSION = 1;
const IDB_STORE = 'pageBlobs';

export class PersistenceService {
  constructor() {
    this._dbPromise = null;
    this._saveTimer = null;
    this._disabled = false;
  }

  _openDb() {
    if (this._disabled || typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (this._dbPromise) {
      return this._dbPromise;
    }

    this._dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          this._disabled = true;
          resolve(null);
        };
      } catch {
        this._disabled = true;
        resolve(null);
      }
    });

    return this._dbPromise;
  }

  scheduleSave(state, delayMs = 350) {
    if (this._disabled || typeof localStorage === 'undefined') {
      return;
    }
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this.save(state);
    }, delayMs);
  }

  async save(state) {
    if (this._disabled || typeof localStorage === 'undefined' || !state) {
      return false;
    }

    try {
      const filledSlots = [];
      const pageUrls = state.allPageImages || [];
      const blankUrl = state._blankPageUrl;

      const db = await this._openDb();
      const blobEntries = [];

      if (db && typeof fetch === 'function') {
        for (let i = 0; i < pageUrls.length; i++) {
          const url = pageUrls[i];
          if (url && url !== blankUrl && (url.startsWith('blob:') || url.startsWith('data:'))) {
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              blobEntries.push({ index: i, blob });
              filledSlots.push(i);
            } catch {
              // Ignore individual fetch errors (e.g. mocked URLs in unit tests)
            }
          }
        }

        await new Promise((resolve) => {
          try {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            store.clear();
            for (const { index, blob } of blobEntries) {
              store.put(blob, `slot_${index}`);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        });
      }

      const meta = {
        version: 1,
        updatedAt: Date.now(),
        gridSize: { ...state.gridSize },
        layoutPresetId: state.layoutPresetId,
        paperSize: state.paperSize,
        orientation: state.orientation,
        margin: state.margin || 0,
        pageFlips: { ...state.pageFlips },
        pageRotations: { ...(state.pageRotations || {}) },
        pageZooms: { ...state.pageZooms },
        totalSlots: pageUrls.length,
        filledSlots
      };

      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
      return true;
    } catch {
      return false;
    }
  }

  async restore() {
    if (this._disabled || typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(STORAGE_META_KEY);
      if (!raw) {
        return null;
      }

      const meta = JSON.parse(raw);
      if (!meta || typeof meta !== 'object' || meta.version !== 1) {
        await this.clear();
        return null;
      }

      const db = await this._openDb();
      const pageBlobs = new Map();

      if (db && Array.isArray(meta.filledSlots) && meta.filledSlots.length > 0) {
        await new Promise((resolve) => {
          try {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            let remaining = meta.filledSlots.length;

            meta.filledSlots.forEach((slotIndex) => {
              const req = store.get(`slot_${slotIndex}`);
              req.onsuccess = () => {
                if (req.result instanceof Blob) {
                  pageBlobs.set(slotIndex, req.result);
                }
                remaining--;
                if (remaining <= 0) {
                  resolve();
                }
              };
              req.onerror = () => {
                remaining--;
                if (remaining <= 0) {
                  resolve();
                }
              };
            });
          } catch {
            resolve();
          }
        });
      }

      return {
        meta,
        pageBlobs
      };
    } catch {
      await this.clear();
      return null;
    }
  }

  async clear() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_META_KEY);
      }
    } catch {
      // Ignore storage errors
    }

    const db = await this._openDb();
    if (!db) {
      return;
    }

    await new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
