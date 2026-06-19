const Store = require('electron-store');
const { createLogger } = require('./logger');

const credLogger = createLogger('credentials');

const schema = {
  edc: {
    type: 'object',
    properties: {
      comPort: { type: 'string', default: '' },
      baudRate: { type: 'number', default: 9600 },
      dataBits: { type: 'number', default: 8 },
      stopBits: { type: 'number', default: 1 },
      parity: { type: 'string', default: 'none' },
      retryCount: { type: 'number', default: 3 },
      ackTimeout: { type: 'number', default: 5000 },
      responseTimeout: { type: 'number', default: 60000 }
    },
    default: {}
  },
  xray: {
    type: 'object',
    properties: {
      watchFolder: { type: 'string', default: '' },
      apiBaseUrl: { type: 'string', default: 'https://api.dentcloud.app' },
      clinicBranchURL: { type: 'string', default: '' },
      autoStart: { type: 'boolean', default: true },
      notifications: { type: 'boolean', default: true }
    },
    default: {}
  },
  ws: {
    type: 'object',
    properties: {
      port: { type: 'number', default: 9900 },
      legacyCardPort: { type: 'number', default: 8088 },
      legacyEdcPort: { type: 'number', default: 5000 }
    },
    default: {}
  },
  app: {
    type: 'object',
    properties: {
      minimizeToTray: { type: 'boolean', default: true },
      autoStart: { type: 'boolean', default: false }
    },
    default: {}
  }
};

let store = null;

function getStore() {
  if (!store) {
    store = new Store({ schema });
  }
  return store;
}

function getConfig(section) {
  const s = getStore();
  if (section) return s.get(section);
  return s.store;
}

function setConfig(section, value) {
  const s = getStore();
  s.set(section, value);
}

function saveCredential(key, value) {
  let encryptionAvailable = false;
  try {
    const { safeStorage } = require('electron');
    encryptionAvailable = safeStorage.isEncryptionAvailable();
  } catch (err) {
    credLogger.warn('safeStorage unavailable', { key, error: err.message });
  }

  // Always save plain-text fallback so credentials survive DPAPI context changes after updates
  let plainWritten = false;
  try {
    getStore().set(`_plain.${key}`, value);
    plainWritten = true;
  } catch (err) {
    credLogger.error('Plain credential write failed', { key, error: err.message });
  }

  let encryptedWritten = false;
  if (encryptionAvailable) {
    try {
      const { safeStorage } = require('electron');
      const encrypted = safeStorage.encryptString(value);
      getStore().set(`_encrypted.${key}`, encrypted.toString('base64'));
      encryptedWritten = true;
    } catch (err) {
      credLogger.error('Encrypted credential write failed', { key, error: err.message });
    }
  }

  credLogger.info('saveCredential', { key, encryptionAvailable, plainWritten, encryptedWritten });
  return encryptedWritten;
}

function loadCredential(key) {
  const hasEncrypted = !!getStore().get(`_encrypted.${key}`);
  const hasPlain = !!getStore().get(`_plain.${key}`);
  let encryptionAvailable = false;
  try {
    const { safeStorage } = require('electron');
    encryptionAvailable = safeStorage.isEncryptionAvailable();
  } catch (err) {
    credLogger.warn('safeStorage unavailable', { key, error: err.message });
  }
  credLogger.info('loadCredential begin', { key, hasEncrypted, hasPlain, encryptionAvailable });

  if (hasEncrypted && encryptionAvailable) {
    try {
      const { safeStorage } = require('electron');
      const encrypted = getStore().get(`_encrypted.${key}`);
      const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      // Mirror to plain so a future DPAPI context change doesn't orphan us
      if (!hasPlain) {
        try {
          getStore().set(`_plain.${key}`, decrypted);
          credLogger.info('loadCredential mirrored encrypted->plain', { key });
        } catch (err) {
          credLogger.error('Plain mirror write failed', { key, error: err.message });
        }
      }
      credLogger.info('loadCredential result', { key, source: 'encrypted' });
      return decrypted;
    } catch (err) {
      // Decryption failed (e.g. DPAPI context changed after update) -- fall through to plain text
      credLogger.warn('Decrypt failed, falling back to plain', { key, error: err.message });
    }
  }

  const plain = getStore().get(`_plain.${key}`) || null;
  if (plain && encryptionAvailable) {
    // Re-encrypt for next time so the encrypted path works again
    try {
      const { safeStorage } = require('electron');
      const encrypted = safeStorage.encryptString(plain);
      getStore().set(`_encrypted.${key}`, encrypted.toString('base64'));
      credLogger.info('loadCredential re-encrypted plain->encrypted', { key });
    } catch (err) {
      credLogger.error('Re-encrypt write failed', { key, error: err.message });
    }
  }
  credLogger.info('loadCredential result', { key, source: plain ? 'plain' : 'none' });
  return plain;
}

module.exports = { getConfig, setConfig, saveCredential, loadCredential, getStore };
