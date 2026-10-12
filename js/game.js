// Reglas del juego "¿Quién se ha comido la tarta de Inés?".
// Todas las funciones son puras: reciben un estado y devuelven uno nuevo (o lanzan GameError).
import { generateCode, defaultRng } from './codes.js';
import { pickCharacter, HOST_CHARACTER, CHARACTERS } from './characters.js';

export const HOST_ID = 'HOST';
export const MIN_SLICES = 12;
export const MAX_ACCOMPLICES = 3;
export const MIN_PLAYERS = 3;

export const ROLES = { THIEF: 'thief', ACCOMPLICE: 'accomplice', DETECTIVE: 'detective' };
export const STATUS = { ACTIVE: 'active', BRIBED: 'bribed', ELIMINATED: 'eliminated' };

export class GameError extends Error {}

function fail(msg) {
  throw new GameError(msg);
}

function clone(state) {
  // JSON evita valores undefined (Firebase no los admite).
  return JSON.parse(JSON.stringify(state));
}

export function createInitialState() {
  return {
    phase: 'lobby',
    players: {},
    questions: {},
    log: [],
    settings: { accomplices: 1, totalSlices: MIN_SLICES, hostPlays: true },
    winner: null,
    endReason: null,
    seq: 0,
  };
}

// Firebase elimina objetos/arrays vacíos y convierte arrays en objetos: normalizamos.
export function normalizeState(raw) {
  const base = createInitialState();
  if (!raw || typeof raw !== 'object') return base;
  const s = { ...base, ...raw };
  // Mapas sin prototipo: un id como "__proto__" nunca puede tocar Object.prototype.
  s.players = Object.assign(Object.create(null), raw.players && typeof raw.players === 'object' ? raw.players : {});
  for (const id of Object.keys(s.players)) {
    const p = { ...s.players[id] };
    p.asked = p.asked && typeof p.asked === 'object' ? p.asked : {};
    p.slices = p.slices || 0;
    p.eaten = p.eaten || 0;
    p.role = p.role || null;
    p.status = p.status || STATUS.ACTIVE;
    s.players[id] = p;
  }
  s.questions = Object.assign(Object.create(null), raw.questions && typeof raw.questions === 'object' ? raw.questions : {});
  s.log = Array.isArray(raw.log) ? raw.log.filter(Boolean) : Object.values(raw.log || {});
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.seq = raw.seq || 0;
  return s;
}

function addLog(state, text, audience = null) {
  state.seq += 1;
  // audience = null → público; si no, lista de ids que pueden verlo.
  state.log.push({ id: state.seq, text, audience: audience || null, at: Date.now() });
}

export function displayName(state, id) {
  const p = state.players[id];
  return p ? p.character : '¿?';
}

function requirePhase(state, phase) {
  if (state.phase !== phase) {
    fail(phase === 'playing' ? 'La partida no está en curso.' : 'La partida ya ha empezado.');
  }
}

function isSafeKey(id) {
  return typeof id === 'string' && id !== '__proto__' && id !== 'constructor' && id !== 'prototype';
}

function requirePlayer(state, id) {
  if (!isSafeKey(id) || !Object.hasOwn(state.players, id)) fail('Jugadora desconocida.');
  return state.players[id];
}

function getQuestion(state, id) {
  if (!isSafeKey(id) || !Object.hasOwn(state.questions, id)) return null;
  return state.questions[id];
}

function isActiveDetective(p) {
  return p.role === ROLES.DETECTIVE && p.status === STATUS.ACTIVE;
}

function isThiefTeam(p) {
  return p.role === ROLES.THIEF || p.role === ROLES.ACCOMPLICE;
}

// ---------- Lobby ----------

export function addPlayer(state0, realName, rng = defaultRng) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'lobby');
  const name = String(realName || '').trim();
  if (!name) fail('Escribe el nombre de tu amiga.');
  if (name.length > 40) fail('El nombre es demasiado largo.');
  const used = new Set(Object.values(state.players).map((p) => p.character));
  const character = pickCharacter(used, rng);
  if (!character) fail(`No caben más de ${CHARACTERS.length} amigas.`);
  const code = generateCode(rng, new Set(Object.keys(state.players)));
  state.players[code] = {
    id: code,
    code,
    realName: name,
    character: character.name,
    movie: character.movie,
    emoji: character.emoji,
    color: character.color,
    isHost: false,
    role: null,
    status: STATUS.ACTIVE,
    slices: 0,
    eaten: 0,
    asked: {},
    joinedAt: Date.now(),
  };
  return { state, player: state.players[code] };
}

export function removePlayer(state0, id) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'lobby');
  if (id === HOST_ID) fail('No puedes eliminar a Inés.');
  requirePlayer(state, id);
  delete state.players[id];
  return state;
}

export function setHostPlays(state0, hostPlays) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'lobby');
  state.settings.hostPlays = !!hostPlays;
  return state;
}

export function maxAccomplices(playerCount) {
  // Siempre debe haber 1 ladrona y al menos 1 detective.
  return Math.max(0, Math.min(MAX_ACCOMPLICES, playerCount - 2));
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startGame(state0, { accomplices, totalSlices, hostPlays }, rng = defaultRng) {
  const state = normalizeState(clone(state0));
  if (hostPlays === undefined) hostPlays = state.settings.hostPlays !== false;
  requirePhase(state, 'lobby');
  accomplices = Number(accomplices);
  totalSlices = Number(totalSlices);
  if (!Number.isInteger(totalSlices) || totalSlices < MIN_SLICES) {
    fail(`La tarta debe tener al menos ${MIN_SLICES} trozos.`);
  }
  if (hostPlays && !state.players[HOST_ID]) {
    state.players[HOST_ID] = {
      id: HOST_ID,
      code: null,
      realName: 'Inés',
      character: HOST_CHARACTER.name,
      movie: HOST_CHARACTER.movie,
      emoji: HOST_CHARACTER.emoji,
      color: HOST_CHARACTER.color,
      isHost: true,
      role: null,
      status: STATUS.ACTIVE,
      slices: 0,
      eaten: 0,
      asked: {},
      joinedAt: Date.now(),
    };
  }
  if (!hostPlays) delete state.players[HOST_ID];
  const ids = Object.keys(state.players);
  if (ids.length < MIN_PLAYERS) fail(`Hacen falta al menos ${MIN_PLAYERS} jugadoras.`);
  const maxAcc = maxAccomplices(ids.length);
  if (!Number.isInteger(accomplices) || accomplices < 0 || accomplices > maxAcc) {
    fail(`El número de cómplices debe estar entre 0 y ${maxAcc}.`);
  }
  // Es la tarta de Inés: ella nunca es la ladrona.
  const thiefCandidates = shuffle(ids.filter((id) => id !== HOST_ID), rng);
  const thiefId = thiefCandidates[0];
  const rest = shuffle(ids.filter((id) => id !== thiefId), rng);
  const accompliceIds = new Set(rest.slice(0, accomplices));
  for (const id of ids) {
    const p = state.players[id];
    p.status = STATUS.ACTIVE;
    p.eaten = 0;
    p.asked = {};
    p.slices = 0;
    if (id === thiefId) {
      p.role = ROLES.THIEF;
      p.slices = totalSlices;
    } else if (accompliceIds.has(id)) {
      p.role = ROLES.ACCOMPLICE;
    } else {
      p.role = ROLES.DETECTIVE;
    }
  }
  state.settings = { accomplices, totalSlices, hostPlays: !!hostPlays };
  state.phase = 'playing';
  state.startedAt = Date.now();
  addLog(state, `¡Empieza la investigación! Hay ${totalSlices} trozos de tarta escondidos y ${accomplices} cómplice(s).`);
  return checkEnd(state);
}

// ---------- Acciones de partida ----------

export function availableTargets(state, fromId) {
  return Object.values(state.players).filter(
    (p) => p.id !== fromId && p.status !== STATUS.ELIMINATED,
  );
}

export function askableTargets(state, fromId) {
  const from = state.players[fromId];
  if (!from) return [];
  return availableTargets(state, fromId).filter((p) => !from.asked[p.id]);
}

export function pendingQuestionOf(state, fromId) {
  return Object.values(state.questions).find(
    (q) => q.from === fromId && (q.status === 'pending' || q.status === 'offered'),
  ) || null;
}

// Una detective pregunta a otra jugadora "¿eres la ladrona?". Solo una vez a cada jugadora.
export function ask(state0, fromId, toId) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  const from = requirePlayer(state, fromId);
  const to = requirePlayer(state, toId);
  if (!isActiveDetective(from)) fail('Solo las detectives pueden preguntar.');
  if (fromId === toId) fail('No puedes preguntarte a ti misma.');
  if (to.status === STATUS.ELIMINATED) fail('Esa jugadora ya está eliminada.');
  if (from.asked[toId]) fail('Ya le has preguntado a esa jugadora.');
  if (pendingQuestionOf(state, fromId)) fail('Espera a que te respondan la pregunta anterior.');
  from.asked[toId] = true;
  state.seq += 1;
  const id = `q${state.seq}`;
  state.questions[id] = { id, from: fromId, to: toId, status: 'pending', offer: 0, at: Date.now() };
  addLog(state, `${from.character} pregunta a ${to.character}: "¿Eres tú la ladrona?"`, [fromId, toId]);
  return state;
}

// La jugadora preguntada responde "no soy la ladrona" (offer = 0) o ofrece trozos de tarta.
export function respond(state0, questionId, byId, offer) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  const q = getQuestion(state, questionId);
  if (!q || q.status !== 'pending') fail('Esa pregunta ya no está pendiente.');
  if (q.to !== byId) fail('Esa pregunta no es para ti.');
  const by = requirePlayer(state, byId);
  const asker = requirePlayer(state, q.from);
  offer = Number(offer);
  if (!Number.isInteger(offer) || offer < 0) fail('Oferta no válida.');
  if (offer === 0) {
    q.status = 'closed';
    q.result = 'denied';
    addLog(state, `${by.character} responde a ${asker.character}: "No, yo no he sido."`, [q.from, byId]);
    return state;
  }
  if (offer > by.slices) fail('No tienes tantos trozos de tarta.');
  // Los trozos ofrecidos quedan reservados hasta que la detective decida.
  by.slices -= offer;
  q.offer = offer;
  q.status = 'offered';
  addLog(
    state,
    `${by.character} ofrece a ${asker.character} ${offer} trozo(s) de tarta a cambio de su silencio.`,
    [q.from, byId],
  );
  return state;
}

// Reparte trozos entre la ladrona y las cómplices; lo que sobra se lo queda la ladrona.
function distribute(state, slices) {
  if (slices <= 0) return;
  const team = Object.values(state.players).filter((p) => isThiefTeam(p) && p.status !== STATUS.ELIMINATED);
  const thief = team.find((p) => p.role === ROLES.THIEF);
  if (!thief) return;
  const share = Math.floor(slices / team.length);
  for (const p of team) p.slices += share;
  thief.slices += slices - share * team.length;
}

function eliminate(state, p) {
  p.status = STATUS.ELIMINATED;
  const leftover = p.slices;
  p.slices = 0;
  distribute(state, leftover);
  addLog(state, `🚫 ${p.character} ha sido eliminada.`);
}

// La detective acepta o rechaza el soborno.
export function decide(state0, questionId, byId, accept) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  const q = getQuestion(state, questionId);
  if (!q || q.status !== 'offered') fail('No hay ninguna oferta pendiente.');
  if (q.from !== byId) fail('Esa oferta no es para ti.');
  const det = requirePlayer(state, byId);
  const briber = requirePlayer(state, q.to);
  q.status = 'closed';
  if (accept) {
    // Se come los trozos y pasa a ser cómplice: ya no puede preguntar ni acusar.
    det.eaten += q.offer;
    det.role = ROLES.ACCOMPLICE;
    det.status = STATUS.BRIBED;
    q.result = 'accepted';
    addLog(state, `${det.character} acepta el soborno de ${briber.character} y se come ${q.offer} trozo(s).`, [byId, q.to]);
    // checkEnd anula las preguntas que tuviera pendientes como detective.
  } else {
    q.result = 'rejected';
    // Quien ofrecía recupera los trozos reservados.
    briber.slices += q.offer;
    if (briber.role === ROLES.THIEF) {
      // Rechazar el soborno de la ladrona es peligroso: la detective desaparece.
      addLog(state, `${det.character} rechaza el soborno de ${briber.character}... y desaparece misteriosamente.`, [byId, q.to]);
      eliminate(state, det);
    } else {
      // Si quien ofrecía no era la ladrona, no pasa nada más.
      addLog(state, `${det.character} rechaza el soborno de ${briber.character}.`, [byId, q.to]);
    }
  }
  return checkEnd(state);
}

// Una detective acusa a alguien de ser la ladrona. Si acierta, ganan las detectives;
// si falla, queda eliminada y sus trozos se reparten entre la ladrona y las cómplices.
export function accuse(state0, fromId, toId) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  const from = requirePlayer(state, fromId);
  const to = requirePlayer(state, toId);
  if (!isActiveDetective(from)) fail('Solo las detectives pueden acusar.');
  if (fromId === toId) fail('No puedes acusarte a ti misma.');
  if (to.status === STATUS.ELIMINATED) fail('Esa jugadora ya está eliminada.');
  if (pendingQuestionOf(state, fromId)) fail('Primero termina tu pregunta pendiente.');
  if (to.role === ROLES.THIEF) {
    addLog(state, `🔎 ${from.character} acusa a ${to.character}... ¡y acierta! ${to.character} era la ladrona.`);
    return finish(state, 'detectives', `${from.character} ha descubierto a la ladrona.`);
  }
  addLog(state, `🔎 ${from.character} acusa a ${to.character}... ¡y se equivoca!`);
  eliminate(state, from);
  return checkEnd(state);
}

export function eat(state0, id) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  const p = requirePlayer(state, id);
  if (p.status === STATUS.ELIMINATED) fail('Estás eliminada.');
  if (p.slices <= 0) fail('No tienes trozos de tarta.');
  p.slices -= 1;
  p.eaten += 1;
  return state;
}

// La ladrona (o una cómplice) pasa trozos a otra persona de su equipo para que pueda sobornar.
export function give(state0, fromId, toId, amount) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  const from = requirePlayer(state, fromId);
  const to = requirePlayer(state, toId);
  amount = Number(amount);
  if (!isThiefTeam(from) || from.status === STATUS.ELIMINATED) fail('Solo la banda de la tarta puede pasar trozos.');
  if (!isThiefTeam(to) || to.status === STATUS.ELIMINATED || fromId === toId) fail('Solo puedes pasar trozos a tu banda.');
  if (!Number.isInteger(amount) || amount <= 0 || amount > from.slices) fail('Cantidad no válida.');
  from.slices -= amount;
  to.slices += amount;
  addLog(state, `${from.character} pasa ${amount} trozo(s) a ${to.character}.`, [fromId, toId]);
  return state;
}

function finish(state, winner, reason) {
  state.phase = 'ended';
  state.winner = winner;
  state.endReason = reason;
  for (const q of Object.values(state.questions)) {
    if (q.status !== 'closed') q.status = 'closed';
  }
  addLog(state, winner === 'detectives'
    ? `🏆 ¡Ganan las detectives! ${reason}`
    : `🍰 ¡Gana la ladrona! ${reason}`);
  return state;
}

export function activeDetectives(state) {
  return Object.values(state.players).filter(isActiveDetective);
}

export function checkEnd(state) {
  if (state.phase !== 'playing') return state;
  // Las preguntas de jugadoras que ya no son detectives activas se anulan
  // (devolviendo los trozos reservados).
  for (const q of Object.values(state.questions)) {
    if (q.status === 'closed') continue;
    const asker = state.players[q.from];
    const target = state.players[q.to];
    if (!asker || !isActiveDetective(asker) || !target || target.status === STATUS.ELIMINATED) {
      if (q.status === 'offered' && target && target.status !== STATUS.ELIMINATED) target.slices += q.offer;
      else if (q.status === 'offered') distribute(state, q.offer);
      q.status = 'closed';
      q.result = 'cancelled';
    }
  }
  if (activeDetectives(state).length === 0) {
    return finish(state, 'thief', 'No queda ninguna detective investigando.');
  }
  return state;
}

// Inés puede dar la partida por terminada: si nadie ha descubierto a la ladrona, esta escapa.
export function endGame(state0) {
  const state = normalizeState(clone(state0));
  requirePhase(state, 'playing');
  // Devolvemos ofertas pendientes antes de cerrar.
  for (const q of Object.values(state.questions)) {
    if (q.status !== 'offered') continue;
    const target = state.players[q.to];
    if (target && target.status !== STATUS.ELIMINATED) target.slices += q.offer;
    else distribute(state, q.offer);
  }
  return finish(state, 'thief', 'Inés ha terminado la partida y la ladrona ha escapado.');
}

export function resetGame(state0, keepPlayers = true) {
  const old = normalizeState(clone(state0));
  const state = createInitialState();
  if (keepPlayers) {
    for (const [id, p] of Object.entries(old.players)) {
      if (id === HOST_ID) continue;
      state.players[id] = { ...p, role: null, status: STATUS.ACTIVE, slices: 0, eaten: 0, asked: {} };
    }
  }
  state.settings = { ...old.settings };
  return state;
}

// Cota superior del número de preguntas posibles: garantiza que la partida termina.
export function remainingQuestionBound(state) {
  let total = 0;
  for (const p of activeDetectives(state)) total += askableTargets(state, p.id).length;
  return total;
}

export function visibleLog(state, viewerId, isAdmin = false) {
  return state.log.filter((e) => !e.audience || (viewerId && e.audience.includes(viewerId)) || (isAdmin && state.phase === 'ended'));
}

export function totalSlicesInPlay(state) {
  let held = 0;
  let eaten = 0;
  for (const p of Object.values(state.players)) {
    held += p.slices;
    eaten += p.eaten;
  }
  let reserved = 0;
  for (const q of Object.values(state.questions)) if (q.status === 'offered') reserved += q.offer;
  return { held, eaten, reserved, total: held + eaten + reserved };
}
