import { CONFIG } from './config.js';
import { createStore } from './store.js';
import { normalizeCode, isValidCode, sha256Hex } from './codes.js';
import {
  HOST_ID, ROLES, STATUS, MIN_SLICES, GameError, maxAccomplices,
  addPlayer, removePlayer, setHostPlays, startGame, ask, respond, decide, accuse, eat, give, endGame, resetGame,
  askableTargets, availableTargets, pendingQuestionOf, visibleLog, activeDetectives,
} from './game.js';
import { drawQr } from './qr.js';

const SESSION_KEY = `tarta-session:${CONFIG.gameId}`;
const SEEN_KEY = `tarta-intro:${CONFIG.gameId}`;

const STORY = [
  {
    img: 'img/fridge-closed.svg',
    alt: 'Una nevera cerrada, de noche, en la cocina de Inés',
    lines: [
      'Era la noche antes del cumpleaños de Inés...',
      'En la nevera de su casa esperaba la tarta más bonita del mundo:',
      'chocolate, fresas y catorce velas listas para soplar.',
      'Todo estaba en silencio. Demasiado silencio...',
    ],
  },
  {
    img: 'img/fridge-open.svg',
    alt: 'La nevera abierta con la comida de siempre y un hueco vacío en el centro',
    lines: [
      'Por la mañana, Inés abrió la nevera.',
      'La leche, los huevos, los yogures, el queso... todo seguía en su sitio.',
      'Pero en el centro había un hueco vacío. ¡LA TARTA HABÍA DESAPARECIDO!',
      'Alguien entró en casa de Inés y se llevó su tarta de cumpleaños.',
      'Dicen que la ladrona reparte trozos de tarta para comprar el silencio de todas...',
      'Vuestra misión: descubrir QUIÉN es esa persona.',
    ],
  },
];

const ui = {
  store: null,
  state: null,
  session: null, // { kind: 'admin' } | { kind: 'player', id }
  tab: 'manage',
  story: null, // { scene, onDone }
  selected: null,
  roleHidden: true,
  error: '',
  modal: null,
};

const app = document.getElementById('app');
const modal = document.getElementById('modal');

// ---------- utilidades ----------

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function gameUrl(code) {
  const base = CONFIG.publicUrl || `${location.origin}${location.pathname}`;
  const url = new URL(base);
  if (code) url.searchParams.set('c', code);
  return url.toString();
}

function badge(p, big = false) {
  return `<span class="badge${big ? ' big' : ''}" style="background:${esc(p.color)}" aria-hidden="true">${esc(p.emoji)}</span>`;
}

function isAdmin() {
  return ui.session?.kind === 'admin';
}

function myId() {
  if (ui.session?.kind === 'player') return ui.session.id;
  if (isAdmin() && ui.tab === 'play') return HOST_ID;
  return null;
}

function saveSession() {
  if (ui.session) localStorage.setItem(SESSION_KEY, JSON.stringify(ui.session));
  else localStorage.removeItem(SESSION_KEY);
}

function introSeen() {
  return localStorage.getItem(SEEN_KEY) === '1';
}

async function run(fn) {
  ui.error = '';
  try {
    return await ui.store.transact(fn);
  } catch (e) {
    ui.error = e instanceof GameError ? e.message : `Error: ${e.message}`;
    if (!(e instanceof GameError)) console.error(e);
    render();
    return null;
  }
}

// ---------- historia con máquina de escribir ----------

function startStory(onDone) {
  ui.story = { scene: 0, onDone };
  renderStory();
}

function renderStory() {
  const scene = STORY[ui.story.scene];
  app.innerHTML = `
    <h1>¿Quién se ha comido la tarta de Inés?</h1>
    <section class="card story">
      <img src="${scene.img}" alt="${esc(scene.alt)}">
      <div class="typewriter" id="tw"></div>
      <div class="row" style="justify-content:space-between">
        <button class="link" data-action="story-skip">Saltar historia</button>
        <button id="story-next" data-action="story-next" disabled>Siguiente ▶</button>
      </div>
    </section>`;
  typewrite(document.getElementById('tw'), scene.lines, () => {
    const next = document.getElementById('story-next');
    if (next) next.disabled = false;
  });
}

let typeTimer = null;
function typewrite(el, lines, done) {
  clearTimeout(typeTimer);
  const full = lines.join('\n');
  let i = 0;
  const finish = () => {
    clearTimeout(typeTimer);
    el.innerHTML = `${esc(full)}<span class="caret">&nbsp;</span>`;
    done();
  };
  el.onclick = finish; // tocar el texto lo muestra entero
  const tick = () => {
    if (!el.isConnected) return;
    i += 1;
    el.innerHTML = `${esc(full.slice(0, i))}<span class="caret">&nbsp;</span>`;
    if (i >= full.length) return done();
    const ch = full[i - 1];
    typeTimer = setTimeout(tick, ch === '\n' ? 650 : '.,!?'.includes(ch) ? 160 : 38);
  };
  tick();
}

function endStory() {
  clearTimeout(typeTimer);
  localStorage.setItem(SEEN_KEY, '1');
  const done = ui.story?.onDone;
  ui.story = null;
  if (done) done();
  render();
}

// ---------- pantallas ----------

function render() {
  if (ui.story) return; // la historia se gestiona aparte para no reiniciar la animación
  const s = ui.state;
  if (!s) return;
  if (!ui.session) return renderLogin();
  if (ui.session.kind === 'player' && !s.players[ui.session.id]) {
    ui.session = null;
    saveSession();
    ui.error = 'Ese código ya no es válido. Pídele uno nuevo a Inés.';
    return renderLogin();
  }
  let html = '<h1>¿Quién se ha comido la tarta de Inés?</h1>';
  if (ui.session.kind === 'spectator') {
    html += spectatorView(s);
  } else if (isAdmin()) {
    const canPlay = !!s.players[HOST_ID];
    html += `<nav class="tabs">
      <button class="${ui.tab === 'manage' ? 'active' : ''}" data-action="tab" data-tab="manage">👑 Gestionar</button>
      ${canPlay ? `<button class="${ui.tab === 'play' ? 'active' : ''}" data-action="tab" data-tab="play">🎂 Jugar</button>` : ''}
      <button class="secondary" data-action="logout">Salir</button>
    </nav>`;
    if (ui.tab === 'play' && !canPlay) ui.tab = 'manage';
    html += ui.tab === 'manage' ? adminView(s) : playerView(s, HOST_ID);
  } else {
    html += playerView(s, ui.session.id);
  }
  html += `<p class="mode">${ui.store.mode === 'online' ? '🟢 En línea' : '🟡 Modo demo (solo este navegador)'}</p>`;
  // Conservar lo que se esté escribiendo/eligiendo cuando llegan cambios de otras jugadoras.
  const kept = {};
  for (const el of app.querySelectorAll('input[id], select[id]')) {
    kept[el.id] = el.type === 'checkbox' ? null : el.value;
  }
  const focused = document.activeElement?.id;
  const oldLog = document.getElementById('spec-log');
  const stick = !oldLog || oldLog.scrollTop + oldLog.clientHeight >= oldLog.scrollHeight - 8;
  const oldTop = oldLog ? oldLog.scrollTop : 0;
  app.innerHTML = html;
  const newLog = document.getElementById('spec-log');
  if (newLog) newLog.scrollTop = stick ? newLog.scrollHeight : oldTop;
  for (const [id, value] of Object.entries(kept)) {
    const el = document.getElementById(id);
    if (!el || value === null) continue;
    if (el.tagName === 'SELECT') {
      if ([...el.options].some((o) => o.value === value)) el.value = value;
    } else {
      el.value = value;
    }
  }
  if (focused) document.getElementById(focused)?.focus();
}

const ROLE_LABEL = { [ROLES.THIEF]: 'LADRONA', [ROLES.ACCOMPLICE]: 'CÓMPLICE', [ROLES.DETECTIVE]: 'DETECTIVE' };
const STATUS_LABEL = { [STATUS.ACTIVE]: 'activa', [STATUS.BRIBED]: 'sobornada', [STATUS.ELIMINATED]: 'eliminada' };

function pad(text, n) {
  const t = String(text ?? '');
  return t.length >= n ? t : t + ' '.repeat(n - t.length);
}

// Vista de observador (código de acceso especial): todo el estado y el registro, en texto plano.
function spectatorView(s) {
  const who = (id) => (s.players[id] ? `${s.players[id].character}` : String(id));
  const time = (at) => (at ? new Date(at).toLocaleTimeString('es-ES') : '--:--:--');
  const players = Object.values(s.players);
  const rows = players.map((p) => (
    `${pad(p.character, 14)} ${pad(p.realName, 14)} ${pad(p.code, 7)} ${pad(ROLE_LABEL[p.role] || '-', 9)} `
    + `${pad(STATUS_LABEL[p.status] || p.status, 10)} trozos:${pad(p.slices, 3)} comidos:${pad(p.eaten, 3)}`
  ));
  const questions = Object.values(s.questions).filter((q) => q.status === 'pending' || q.status === 'offered');
  const qLines = questions.map((q) => `  ${who(q.from)} -> ${who(q.to)}  [${q.status}${q.offer ? `, ofrece ${q.offer}` : ''}]`);
  const logLines = s.log.map((e) => (
    `[${time(e.at)}] #${pad(e.id, 4)}${e.audience ? ` (privado: ${e.audience.map(who).join(', ')})` : ''} ${e.text}`
  ));
  const head = [
    `FASE: ${s.phase}${s.winner ? `   GANADOR: ${s.winner}` : ''}${s.endReason ? `   MOTIVO: ${s.endReason}` : ''}`,
    `Cómplices: ${s.settings.accomplices}   Trozos totales: ${s.settings.totalSlices}   Jugadoras: ${players.length}`,
  ];
  const text = [
    ...head, '', 'JUGADORAS', ...(rows.length ? rows : ['  (ninguna)']),
    '', 'PREGUNTAS PENDIENTES', ...(qLines.length ? qLines : ['  (ninguna)']),
  ].join('\n');
  return `<nav class="tabs"><button class="secondary" data-action="logout">Salir</button></nav>
    <section class="card"><h2>🕵️ Observador (solo lectura)</h2>
      <pre class="spec">${esc(text)}</pre></section>
    <section class="card"><h2>📜 Registro en tiempo real (${logLines.length})</h2>
      <pre class="spec" id="spec-log">${esc(logLines.length ? logLines.join('\n') : '(sin eventos todavía)')}</pre></section>`;
}

function renderLogin() {
  app.innerHTML = `
    <h1>¿Quién se ha comido la tarta de Inés?</h1>
    <p class="subtitle">Un misterio de cumpleaños 🎂🔎</p>
    <form class="card center" id="login">
      <label for="code">Escribe tu código secreto</label>
      <input id="code" class="code-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="······" required>
      <p class="error">${esc(ui.error)}</p>
      <button type="submit">Entrar</button>
      <p class="muted">Solo puedes jugar si Inés te ha dado un código. También puedes escanear tu QR.</p>
    </form>
    <p class="mode">${ui.store.mode === 'online' ? '🟢 En línea' : '🟡 Modo demo (solo este navegador)'}</p>`;
  const input = document.getElementById('code');
  input.addEventListener('input', () => { input.value = normalizeCode(input.value); });
  document.getElementById('login').addEventListener('submit', (e) => {
    e.preventDefault();
    login(input.value);
  });
}

async function login(raw) {
  const code = normalizeCode(raw);
  ui.error = '';
  if (!isValidCode(code)) {
    ui.error = 'El código tiene 6 letras (sin I, L ni O).';
    return render();
  }
  if (globalThis.crypto?.subtle && (await sha256Hex(code)) === CONFIG.adminCodeHash) {
    ui.session = { kind: 'admin' };
    ui.tab = 'manage';
  } else if (globalThis.crypto?.subtle && (await sha256Hex(code)) === CONFIG.spectatorCodeHash) {
    ui.session = { kind: 'spectator' };
  } else if (Object.hasOwn(ui.state.players, code)) {
    ui.session = { kind: 'player', id: code };
  } else {
    ui.error = 'Código desconocido. ¿Seguro que te lo ha dado Inés?';
    return render();
  }
  saveSession();
  if (!introSeen() && ui.session.kind === 'player') startStory();
  else render();
}

function boardList(s, viewerId, { selectable = false, showReal = false, showRoles = false } = {}) {
  const players = Object.values(s.players).sort((a, b) => (a.isHost ? -1 : b.isHost ? 1 : (a.joinedAt || 0) - (b.joinedAt || 0)));
  if (!players.length) return '<p class="muted">Todavía no hay jugadoras.</p>';
  return `<ul class="players">${players.map((p) => {
    const out = p.status === STATUS.ELIMINATED;
    const canSelect = selectable && !out && p.id !== viewerId;
    const roleTxt = showRoles && p.role ? ` · ${roleLabel(p)}` : '';
    return `<li class="${out ? 'eliminated' : ''} ${canSelect ? 'selectable' : ''} ${ui.selected === p.id && canSelect ? 'selected' : ''}"
        ${canSelect ? `data-action="select" data-id="${esc(p.id)}" tabindex="0" role="button"` : ''}>
      ${badge(p)}
      <span class="who">${esc(p.character)}${p.id === viewerId ? ' <span class="tag me">tú</span>' : ''}
        ${out ? ' <span class="tag out">eliminada</span>' : ''}
        ${showReal && !p.isHost ? `<small>${esc(p.realName)}${roleTxt}</small>` : roleTxt ? `<small>${esc(roleTxt.slice(3))}</small>` : ''}</span>
      ${s.phase !== 'lobby' ? `<span class="cakes" title="Trozos de tarta comidos">🍰 × ${p.eaten}</span>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function roleLabel(p) {
  if (p.role === ROLES.THIEF) return 'Ladrona';
  if (p.role === ROLES.ACCOMPLICE) return p.status === STATUS.BRIBED ? 'Sobornada (cómplice)' : 'Cómplice';
  return 'Detective';
}

// ---------- vista de Inés (gestión) ----------

function adminView(s) {
  const players = Object.values(s.players).filter((p) => !p.isHost);
  let html = '';
  if (s.phase === 'lobby') {
    html += `<form class="card" id="invite">
      <h2>💌 Invitar a una amiga</h2>
      <label for="realName">Nombre de tu amiga (solo lo verás tú)</label>
      <div class="row"><input id="realName" maxlength="40" autocomplete="off" required><button type="submit">Invitar</button></div>
      <p class="muted">Se le asignará un personaje y un código secreto de 6 letras.</p>
    </form>`;
  }
  html += `<section class="card"><h2>👭 Jugadoras (${players.length})</h2>
    <p class="error">${esc(ui.error)}</p>
    ${players.length ? `<ul class="players">${players.map((p) => `<li>
      ${badge(p)}
      <span class="who"><b>${esc(p.realName)}</b><small>${esc(p.character)} · <span class="code">${esc(p.code)}</span>${s.phase !== 'lobby' ? ` · 🍰 × ${p.eaten}${p.status === STATUS.ELIMINATED ? ' · eliminada' : ''}` : ''}</small></span>
      <button class="small" data-action="qr" data-id="${esc(p.id)}">QR</button>
      ${s.phase === 'lobby' ? `<button class="small danger" data-action="remove" data-id="${esc(p.id)}" aria-label="Quitar a ${esc(p.realName)}">✕</button>` : ''}
    </li>`).join('')}</ul>` : '<p class="muted">Invita a tus amigas para empezar.</p>'}
  </section>`;

  if (s.phase === 'lobby') {
    const hostPlays = s.settings.hostPlays !== false;
    const total = players.length + (hostPlays ? 1 : 0);
    const maxAcc = maxAccomplices(total);
    const acc = Math.min(s.settings.accomplices ?? 1, maxAcc);
    html += `<form class="card" id="start">
      <h2>🚀 Empezar la partida</h2>
      <label><input type="checkbox" id="hostPlays" ${hostPlays ? 'checked' : ''} style="width:auto"> Yo (Inés) también juego</label>
      <label for="accomplices">Número de cómplices (máximo ${maxAcc})</label>
      <select id="accomplices">${Array.from({ length: maxAcc + 1 }, (_, i) => `<option ${i === acc ? 'selected' : ''}>${i}</option>`).join('')}</select>
      <label for="slices">Trozos de tarta (mínimo ${MIN_SLICES})</label>
      <input id="slices" type="number" min="${MIN_SLICES}" step="1" value="${Math.max(MIN_SLICES, s.settings.totalSlices || MIN_SLICES)}">
      <p class="muted">Al empezar se sorteará en secreto quién es la ladrona y quiénes las cómplices. Ya no se podrán cambiar los roles ni invitar a nadie más.</p>
      <button type="submit" ${total < 3 ? 'disabled' : ''}>Empezar el juego</button>
      ${total < 3 ? '<p class="muted">Hacen falta al menos 3 jugadoras.</p>' : ''}
    </form>`;
  } else if (s.phase === 'playing') {
    html += `<section class="card"><h2>🔎 Partida en curso</h2>
      <p>Detectives investigando: <b>${activeDetectives(s).length}</b>. Tarta total: ${s.settings.totalSlices} trozos.</p>
      <p class="muted">Si la partida se atasca puedes terminarla: si nadie ha descubierto a la ladrona, ella gana.</p>
      <button class="danger" data-action="end">Terminar partida</button>
    </section>`;
  } else {
    html += endBanner(s) + `<section class="card"><h2>Roles</h2>${boardList(s, null, { showReal: true, showRoles: true })}</section>
      <section class="card"><button data-action="reset">Nueva partida con las mismas amigas</button>
      <button class="danger" data-action="wipe">Borrar todo</button></section>`;
  }
  html += `<section class="card"><button class="secondary" data-action="story">Ver la historia</button></section>`;
  return html;
}

function endBanner(s) {
  const thief = Object.values(s.players).find((p) => p.role === ROLES.THIEF);
  return `<section class="card win">
    <h2>${s.winner === 'detectives' ? '🏆 ¡Ganan las detectives!' : '🍰 ¡Gana la ladrona!'}</h2>
    <p>${esc(s.endReason || '')}</p>
    ${thief ? `<p>La ladrona era ${badge(thief)} <b>${esc(thief.character)}</b>.</p>` : ''}
  </section>`;
}

// ---------- vista de jugadora ----------

function roleCard(p) {
  let cls = p.role;
  let emoji;
  let title;
  let text;
  if (p.status === STATUS.ELIMINATED) {
    cls = 'eliminated';
    emoji = '👻';
    title = 'Estás eliminada';
    text = 'Ya no puedes jugar, pero puedes seguir mirando el tablero.';
  } else if (p.role === ROLES.THIEF) {
    emoji = '🦹‍♀️';
    title = '¡Eres LA LADRONA!';
    text = 'Tú te llevaste la tarta. Cuando una detective te pregunte, ofrécele trozos de tarta a cambio de su silencio. Si rechaza tu soborno… desaparecerá. Puedes pasar trozos a tus cómplices. Ganas si no queda ninguna detective investigando.';
  } else if (p.role === ROLES.ACCOMPLICE) {
    emoji = '🤫';
    title = p.status === STATUS.BRIBED ? 'Te has dejado sobornar: ahora eres CÓMPLICE' : 'Eres CÓMPLICE de la ladrona';
    text = 'Ayuda a la ladrona: si te pregunta una detective, dile que no has sido tú u ofrécele tarta para que se pase a vuestro bando. Ganas si gana la ladrona.';
  } else {
    emoji = '🕵️‍♀️';
    title = 'Eres DETECTIVE';
    text = 'Pregunta a las demás si son la ladrona (una vez a cada una). Si te ofrecen tarta puedes aceptarla —y pasarte a su bando— o rechazarla. ¡Cuidado! Rechazar el soborno de la verdadera ladrona te elimina. Cuando lo tengas claro, ¡acusa! Si aciertas ganáis; si fallas, quedas eliminada.';
  }
  const hidden = ui.roleHidden && p.status !== STATUS.ELIMINATED;
  return `<section class="card role ${cls} ${hidden ? 'hidden-role' : ''}">
    <div class="secret"><div class="emoji">${emoji}</div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>
    ${p.status !== STATUS.ELIMINATED ? `<button class="small secondary" data-action="toggle-role">${hidden ? '👁️ Ver mi rol (que nadie mire)' : '🙈 Ocultar mi rol'}</button>` : ''}
  </section>`;
}

function playerView(s, id) {
  const me = s.players[id];
  let html = `<section class="card row">${badge(me, true)}<div><h2 style="margin:0">${esc(me.character)}</h2>
    <span class="muted">${me.isHost ? 'La cumpleañera' : esc(me.movie)}</span></div>
    ${ui.session?.kind === 'player' ? '<button class="small secondary" data-action="logout" style="margin-left:auto">Salir</button>' : ''}</section>`;

  if (s.phase === 'lobby') {
    html += `<section class="card center"><h2>⏳ Esperando…</h2>
      <p>Inés todavía está repartiendo los códigos. Cuando empiece la partida descubrirás tu papel en este misterio.</p>
      <button class="secondary" data-action="story">Ver la historia</button></section>`;
    return html;
  }

  if (s.phase === 'ended') html += endBanner(s);
  html += roleCard(me);
  if (ui.error) html += `<p class="card error">${esc(ui.error)}</p>`;

  if (s.phase === 'playing' && me.status !== STATUS.ELIMINATED) {
    html += inbox(s, id);
    html += myCake(s, me);
    if (me.role === ROLES.DETECTIVE && me.status === STATUS.ACTIVE) html += detectiveActions(s, me);
  }

  const showRoles = s.phase === 'ended';
  html += `<section class="card"><h2>📋 Tablero</h2>${boardList(s, id, { selectable: s.phase === 'playing' && me.role === ROLES.DETECTIVE && me.status === STATUS.ACTIVE, showRoles })}</section>`;
  const log = visibleLog(s, id).slice(-40).reverse();
  html += `<section class="card"><h2>📜 Lo que ha pasado</h2><ul class="log">${log.map((e) => `<li class="${e.audience ? 'private' : ''}">${e.audience ? '🔒 ' : ''}${esc(e.text)}</li>`).join('')}</ul></section>`;
  html += '<section class="card"><button class="secondary" data-action="story">Ver la historia</button></section>';
  return html;
}

function inbox(s, id) {
  const me = s.players[id];
  let html = '';
  const incoming = Object.values(s.questions).filter((q) => q.to === id && q.status === 'pending');
  for (const q of incoming) {
    const from = s.players[q.from];
    html += `<section class="card alert"><h3>❓ ${badge(from)} ${esc(from.character)} te pregunta: «¿Eres tú la ladrona?»</h3>
      <button data-action="deny" data-q="${esc(q.id)}">No, yo no he sido</button>
      ${me.slices > 0 ? `<div class="row"><select id="offer-${esc(q.id)}" aria-label="Trozos a ofrecer">${Array.from({ length: me.slices }, (_, i) => `<option>${i + 1}</option>`).join('')}</select>
        <button class="ok" data-action="offer" data-q="${esc(q.id)}">🍰 Ofrecer tarta</button></div>` : '<p class="muted">No tienes tarta para ofrecer.</p>'}
    </section>`;
  }
  const waiting = Object.values(s.questions).filter((q) => q.to === id && q.status === 'offered');
  for (const q of waiting) {
    html += `<section class="card"><p>⏳ Has ofrecido ${q.offer} trozo(s) a ${esc(s.players[q.from].character)}. Esperando su respuesta…</p></section>`;
  }
  const mine = pendingQuestionOf(s, id);
  if (mine) {
    const to = s.players[mine.to];
    if (mine.status === 'pending') {
      html += `<section class="card"><p>⏳ Has preguntado a ${badge(to)} <b>${esc(to.character)}</b>. Esperando su respuesta…</p></section>`;
    } else {
      html += `<section class="card alert"><h3>🍰 ${badge(to)} ${esc(to.character)} te ofrece ${mine.offer} trozo(s) de tarta a cambio de tu silencio</h3>
        <p class="muted">Si aceptas te los comes y te pasas al bando de la ladrona. Si rechazas y era la ladrona… desaparecerás.</p>
        <button class="ok" data-action="accept" data-q="${esc(mine.id)}">Aceptar y comer</button>
        <button class="danger" data-action="reject" data-q="${esc(mine.id)}">Rechazar</button></section>`;
    }
  }
  return html;
}

function myCake(s, me) {
  if (me.role === ROLES.DETECTIVE) return '';
  const team = Object.values(s.players).filter((p) => p.id !== me.id && (p.role === ROLES.THIEF || p.role === ROLES.ACCOMPLICE) && p.status !== STATUS.ELIMINATED);
  return `<section class="card"><h2>🍰 Tu tarta: ${me.slices} trozo(s)</h2>
    <button data-action="eat" ${me.slices > 0 ? '' : 'disabled'}>Comerme un trozo</button>
    ${team.length ? `<h3>Tu banda</h3><ul class="players">${team.map((p) => `<li>${badge(p)}<span class="who">${esc(p.character)}<small>${esc(roleLabel(p))} · tiene ${p.slices} trozo(s)</small></span></li>`).join('')}</ul>
    ${me.slices > 0 ? `<div class="row"><select id="give-to" aria-label="Pasar tarta a">${team.map((p) => `<option value="${esc(p.id)}">${esc(p.character)}</option>`).join('')}</select>
      <select id="give-n" aria-label="Trozos">${Array.from({ length: me.slices }, (_, i) => `<option>${i + 1}</option>`).join('')}</select>
      <button class="secondary" data-action="give">Pasar tarta</button></div>` : ''}` : ''}
  </section>`;
}

function detectiveActions(s, me) {
  const sel = ui.selected && s.players[ui.selected] && availableTargets(s, me.id).some((p) => p.id === ui.selected) ? s.players[ui.selected] : null;
  const pending = !!pendingQuestionOf(s, me.id);
  const canAsk = sel && askableTargets(s, me.id).some((p) => p.id === sel.id);
  return `<section class="card"><h2>🔎 Investigar</h2>
    ${sel ? `<p>Has elegido a ${badge(sel)} <b>${esc(sel.character)}</b>.</p>` : '<p>Toca a una jugadora del tablero para elegirla.</p>'}
    <button data-action="ask" ${sel && canAsk && !pending ? '' : 'disabled'}>❓ Preguntar si es la ladrona</button>
    <button class="danger" data-action="accuse" ${sel && !pending ? '' : 'disabled'}>👉 ¡Acusar!</button>
    ${sel && !canAsk ? '<p class="muted">Ya le has preguntado a ella.</p>' : ''}
    <p class="muted">Te quedan ${askableTargets(s, me.id).length} pregunta(s).</p>
  </section>`;
}

// ---------- QR ----------

function showQr(p) {
  const url = gameUrl(p.code);
  modal.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-label="Código de ${esc(p.character)}">
    <h2>${badge(p)} ${esc(p.character)}</h2>
    <canvas id="qr"></canvas>
    <p><span class="code big">${esc(p.code)}</span></p>
    <p class="url muted">${esc(url)}</p>
    <p class="muted">Para: <b>${esc(p.realName)}</b> (solo tú lo ves)</p>
    <button data-action="close-modal">Cerrar</button>
  </div>`;
  modal.hidden = false;
  drawQr(document.getElementById('qr'), url, { emoji: p.emoji, color: p.color, label: `QR de ${p.character}` });
}

function closeModal() {
  modal.hidden = true;
  modal.innerHTML = '';
}

// ---------- eventos ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const s = ui.state;
  const me = myId();
  switch (action) {
    case 'story-next':
      if (ui.story.scene < STORY.length - 1) {
        ui.story.scene += 1;
        renderStory();
      } else endStory();
      break;
    case 'story-skip': endStory(); break;
    case 'story': startStory(); break;
    case 'tab': ui.tab = el.dataset.tab; ui.selected = null; ui.error = ''; render(); break;
    case 'logout': ui.session = null; ui.error = ''; saveSession(); render(); break;
    case 'toggle-role': ui.roleHidden = !ui.roleHidden; render(); break;
    case 'select': ui.selected = el.dataset.id; render(); break;
    case 'qr': showQr(s.players[el.dataset.id]); break;
    case 'close-modal': closeModal(); break;
    case 'remove':
      if (confirm('¿Quitar a esta amiga? Su código dejará de funcionar.')) await run((st) => removePlayer(st, el.dataset.id));
      break;
    case 'end':
      if (confirm('¿Terminar la partida? Si nadie ha descubierto a la ladrona, ganará ella.')) await run((st) => endGame(st));
      break;
    case 'reset':
      if (confirm('¿Empezar una nueva partida con las mismas amigas y códigos?')) await run((st) => resetGame(st, true));
      break;
    case 'wipe':
      if (confirm('¿Borrar todas las jugadoras y códigos?')) await run((st) => resetGame(st, false));
      break;
    case 'ask':
      if (await run((st) => ask(st, me, ui.selected))) {
        ui.selected = null;
        render();
      }
      break;
    case 'accuse': {
      const target = s.players[ui.selected];
      if (target && confirm(`¿Seguro que acusas a ${target.character}? Si te equivocas quedarás eliminada.`)) {
        if (await run((st) => accuse(st, me, ui.selected))) {
          ui.selected = null;
          render();
        }
      }
      break;
    }
    case 'deny': await run((st) => respond(st, el.dataset.q, me, 0)); break;
    case 'offer': {
      const n = Number(document.getElementById(`offer-${el.dataset.q}`).value);
      await run((st) => respond(st, el.dataset.q, me, n));
      break;
    }
    case 'accept': await run((st) => decide(st, el.dataset.q, me, true)); break;
    case 'reject':
      if (confirm('¿Rechazar el soborno? Si es la ladrona, desaparecerás.')) await run((st) => decide(st, el.dataset.q, me, false));
      break;
    case 'eat': await run((st) => eat(st, me)); break;
    case 'give': {
      const to = document.getElementById('give-to').value;
      const n = Number(document.getElementById('give-n').value);
      await run((st) => give(st, me, to, n));
      break;
    }
    default: break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-action="select"]')) {
    e.preventDefault();
    e.target.click();
  }
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'invite') {
    e.preventDefault();
    const input = document.getElementById('realName');
    const name = input.value;
    input.value = '';
    let createdId = null;
    const result = await run((st) => {
      const r = addPlayer(st, name);
      createdId = r.player.id;
      return r.state;
    });
    const created = result && createdId ? result.players[createdId] : null;
    if (created && !ui.error) showQr(created);
    else if (document.getElementById('realName')) document.getElementById('realName').value = name;
  } else if (e.target.id === 'start') {
    e.preventDefault();
    const opts = {
      accomplices: Number(document.getElementById('accomplices').value),
      totalSlices: Number(document.getElementById('slices').value),
      hostPlays: document.getElementById('hostPlays').checked,
    };
    if (confirm('¿Empezar la partida? Los roles se sortean ahora y ya no se podrán cambiar.')) {
      await run((st) => startGame(st, opts));
    }
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.id === 'hostPlays') {
    const checked = e.target.checked;
    await run((st) => setHostPlays(st, checked));
  }
});

// ---------- arranque ----------

async function boot() {
  try {
    ui.store = await createStore(CONFIG);
  } catch (e) {
    console.error(e);
    app.innerHTML = '<p class="card error">No se pudo conectar con la base de datos del juego. Revisa la conexión y recarga la página.</p>';
    return;
  }
  try {
    ui.session = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    ui.session = null;
  }
  let first = true;
  ui.store.subscribe((state) => {
    const prevPhase = ui.state?.phase;
    ui.state = state;
    if (prevPhase === 'lobby' && state.phase === 'playing') ui.roleHidden = true;
    if (first) {
      first = false;
      const params = new URLSearchParams(location.search);
      const code = params.get('c');
      if (code) {
        // Quitamos el código de la barra de direcciones para que no se comparta sin querer.
        history.replaceState(null, '', location.pathname);
        login(code);
        return;
      }
      if (ui.session && !introSeen() && ui.session.kind === 'player') {
        startStory();
        return;
      }
    }
    render();
  });
}

boot();
