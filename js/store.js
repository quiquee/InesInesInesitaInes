// Almacenamiento compartido del estado de la partida.
// - FirebaseStore: multijugador real (varios móviles) usando Firebase Realtime Database.
// - LocalStore: modo demo, todo en el localStorage de este navegador (se sincroniza entre pestañas).
import { normalizeState, GameError } from './game.js';

const FIREBASE_VERSION = '10.12.2';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

class LocalStore {
  constructor(gameId) {
    this.key = `tarta:${gameId}`;
    this.listeners = new Set();
    this.mode = 'demo';
    window.addEventListener('storage', (e) => {
      if (e.key === this.key) this.emit();
    });
  }

  read() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(this.key)));
    } catch {
      return normalizeState(null);
    }
  }

  emit() {
    const s = this.read();
    for (const l of this.listeners) l(s);
  }

  subscribe(cb) {
    this.listeners.add(cb);
    cb(this.read());
    return () => this.listeners.delete(cb);
  }

  async transact(fn) {
    const next = fn(this.read());
    localStorage.setItem(this.key, JSON.stringify(next));
    this.emit();
    return next;
  }
}

class FirebaseStore {
  constructor(gameId, firebaseConfig) {
    this.gameId = gameId;
    this.config = firebaseConfig;
    this.mode = 'online';
  }

  async init() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    await loadScript(`${base}/firebase-app-compat.js`);
    await loadScript(`${base}/firebase-database-compat.js`);
    const app = window.firebase.initializeApp(this.config);
    this.ref = app.database().ref(`games/${this.gameId}`);
    // Mantener la caché caliente para que las transacciones partan del estado real.
    this.ready = new Promise((resolve) => {
      this.ref.on('value', () => resolve());
    });
    await this.ready;
  }

  subscribe(cb) {
    const handler = (snap) => cb(normalizeState(snap.val()));
    this.ref.on('value', handler);
    return () => this.ref.off('value', handler);
  }

  async transact(fn) {
    let error = null;
    const result = await this.ref.transaction((current) => {
      error = null;
      try {
        return fn(normalizeState(current));
      } catch (e) {
        error = e;
        return undefined; // aborta la transacción
      }
    });
    if (error) throw error;
    if (!result.committed) throw new GameError('No se pudo guardar. Inténtalo de nuevo.');
    return normalizeState(result.snapshot.val());
  }
}

export async function createStore(config) {
  if (config.firebase && config.firebase.databaseURL) {
    const store = new FirebaseStore(config.gameId, config.firebase);
    await store.init();
    return store;
  }
  return new LocalStore(config.gameId);
}
