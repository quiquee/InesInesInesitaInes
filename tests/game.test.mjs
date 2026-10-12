import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, addPlayer, startGame, ask, respond, decide, accuse, eat, give, endGame,
  ROLES, STATUS, HOST_ID, GameError, totalSlicesInPlay, remainingQuestionBound, normalizeState,
  removePlayer, resetGame, setHostPlays, visibleLog,
} from '../js/game.js';
import { generateCode, isValidCode, normalizeCode, CODE_ALPHABET } from '../js/codes.js';

function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function lobby(n, rng = seeded()) {
  let state = createInitialState();
  for (let i = 0; i < n; i += 1) state = addPlayer(state, `Amiga ${i}`, rng).state;
  return state;
}

function byRole(state, role) {
  return Object.values(state.players).filter((p) => p.role === role);
}

test('los códigos tienen 6 letras sin I, L ni O', () => {
  assert.ok(!/[ILO]/.test(CODE_ALPHABET));
  const rng = seeded(1);
  for (let i = 0; i < 2000; i += 1) {
    const c = generateCode(rng);
    assert.match(c, /^[A-Z]{6}$/);
    assert.ok(!/[ILO]/.test(c));
    assert.ok(isValidCode(c.toLowerCase()));
  }
  assert.equal(normalizeCode(' abc-def '), 'ABCDEF');
  assert.ok(!isValidCode('ABCDEI'));
  assert.ok(!isValidCode('ABCDE'));
});

test('cada amiga recibe un personaje y un código únicos', () => {
  const s = lobby(20);
  const players = Object.values(s.players);
  assert.equal(new Set(players.map((p) => p.character)).size, 20);
  assert.equal(new Set(players.map((p) => p.code)).size, 20);
  assert.equal(removePlayer(s, players[0].id).players[players[0].id], undefined);
});

test('reparto de roles: 1 ladrona (nunca Inés), cómplices pedidas, resto detectives', () => {
  for (let seed = 1; seed < 50; seed += 1) {
    const rng = seeded(seed);
    const s = startGame(lobby(6, rng), { accomplices: 3, totalSlices: 12, hostPlays: true }, rng);
    assert.equal(s.phase, 'playing');
    const thieves = byRole(s, ROLES.THIEF);
    assert.equal(thieves.length, 1);
    assert.notEqual(thieves[0].id, HOST_ID);
    assert.equal(thieves[0].slices, 12);
    assert.equal(byRole(s, ROLES.ACCOMPLICE).length, 3);
    assert.equal(byRole(s, ROLES.DETECTIVE).length, 3);
  }
});

test('validaciones al empezar', () => {
  const s = lobby(4);
  assert.throws(() => startGame(s, { accomplices: 1, totalSlices: 11 }), GameError);
  assert.throws(() => startGame(s, { accomplices: 4, totalSlices: 12 }), GameError);
  assert.throws(() => startGame(lobby(1), { accomplices: 0, totalSlices: 12, hostPlays: true }), GameError);
  // Con 3 jugadoras solo cabe 1 cómplice (1 ladrona + 1 detective mínimo).
  assert.throws(() => startGame(lobby(3), { accomplices: 2, totalSlices: 12, hostPlays: false }), GameError);
  const started = startGame(s, { accomplices: 1, totalSlices: 12 });
  assert.throws(() => addPlayer(started, 'Tarde'), GameError);
  assert.throws(() => startGame(started, { accomplices: 1, totalSlices: 12 }), GameError);
});

function setup(seed = 7, n = 5, accomplices = 1) {
  const rng = seeded(seed);
  const s = startGame(lobby(n, rng), { accomplices, totalSlices: 12, hostPlays: false }, rng);
  return {
    s,
    thief: byRole(s, ROLES.THIEF)[0].id,
    accs: byRole(s, ROLES.ACCOMPLICE).map((p) => p.id),
    dets: byRole(s, ROLES.DETECTIVE).map((p) => p.id),
  };
}

test('aceptar un soborno convierte a la detective en cómplice que se come la tarta', () => {
  let { s, thief, dets } = setup();
  s = ask(s, dets[0], thief);
  const qid = Object.keys(s.questions)[0];
  s = respond(s, qid, thief, 3);
  assert.equal(s.players[thief].slices, 9);
  s = decide(s, qid, dets[0], true);
  assert.equal(s.players[dets[0]].role, ROLES.ACCOMPLICE);
  assert.equal(s.players[dets[0]].status, STATUS.BRIBED);
  assert.equal(s.players[dets[0]].eaten, 3);
  assert.equal(totalSlicesInPlay(s).total, 12);
  assert.throws(() => ask(s, dets[0], dets[1]), GameError);
});

test('rechazar el soborno de la ladrona elimina a la detective', () => {
  let { s, thief, dets } = setup();
  s = ask(s, dets[0], thief);
  const qid = Object.keys(s.questions)[0];
  s = respond(s, qid, thief, 2);
  s = decide(s, qid, dets[0], false);
  assert.equal(s.players[dets[0]].status, STATUS.ELIMINATED);
  assert.equal(s.players[thief].slices, 12);
  assert.equal(totalSlicesInPlay(s).total, 12);
});

test('rechazar el soborno de una cómplice no tiene consecuencias', () => {
  let { s, thief, accs, dets } = setup();
  s = give(s, thief, accs[0], 4);
  s = ask(s, dets[0], accs[0]);
  const qid = Object.keys(s.questions)[0];
  s = respond(s, qid, accs[0], 2);
  s = decide(s, qid, dets[0], false);
  assert.equal(s.players[dets[0]].status, STATUS.ACTIVE);
  assert.equal(s.players[accs[0]].slices, 4);
  assert.throws(() => ask(s, dets[0], accs[0]), GameError, 'no se puede repetir pregunta');
});

test('no se puede ofrecer más tarta de la que se tiene, y responder "no" cierra la pregunta', () => {
  let { s, dets } = setup();
  s = ask(s, dets[0], dets[1]);
  const qid = Object.keys(s.questions)[0];
  assert.throws(() => respond(s, qid, dets[1], 1), GameError);
  s = respond(s, qid, dets[1], 0);
  assert.equal(s.questions[qid].status, 'closed');
});

test('acusación correcta: ganan las detectives', () => {
  let { s, thief, dets } = setup();
  s = accuse(s, dets[0], thief);
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 'detectives');
});

test('acusación fallida: eliminada y sus trozos se reparten (sobrante para la ladrona)', () => {
  let { s, thief, accs, dets } = setup(7, 6, 1);
  // Simulamos que la detective tiene 3 trozos (p. ej. de una variante) para comprobar el reparto.
  s = normalizeState(JSON.parse(JSON.stringify(s)));
  s.players[dets[0]].slices = 3;
  s.players[thief].slices -= 3;
  s = accuse(s, dets[0], accs[0]);
  assert.equal(s.players[dets[0]].status, STATUS.ELIMINATED);
  assert.equal(s.players[dets[0]].slices, 0);
  // 3 trozos entre 2 (ladrona + cómplice): 1 cada una y el sobrante a la ladrona.
  assert.equal(s.players[accs[0]].slices, 1);
  assert.equal(s.players[thief].slices, 9 + 2);
  assert.equal(totalSlicesInPlay(s).total, 12);
});

test('gana la ladrona cuando no quedan detectives', () => {
  let { s, accs, dets } = setup(3, 4, 1);
  for (const d of dets) s = accuse(s, d, accs[0]);
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 'thief');
});

test('comer tarta', () => {
  let { s, thief, dets } = setup();
  s = eat(s, thief);
  assert.equal(s.players[thief].eaten, 1);
  assert.equal(s.players[thief].slices, 11);
  assert.throws(() => eat(s, dets[0]), GameError);
});

test('Inés puede terminar la partida y reiniciarla', () => {
  let { s } = setup();
  s = endGame(s);
  assert.equal(s.winner, 'thief');
  const r = resetGame(s);
  assert.equal(r.phase, 'lobby');
  assert.equal(Object.keys(r.players).length, 5);
});

// Simulación aleatoria: cualquier secuencia de jugadas válidas termina en un número finito de pasos.
test('cualquier partida aleatoria termina', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const rng = seeded(seed);
    const n = 3 + Math.floor(rng() * 12);
    const acc = Math.floor(rng() * (Math.min(3, n - 2) + 1));
    let s = startGame(lobby(n, rng), { accomplices: acc, totalSlices: 12 + Math.floor(rng() * 10), hostPlays: false }, rng);
    let steps = 0;
    let bound = remainingQuestionBound(s);
    while (s.phase === 'playing') {
      steps += 1;
      assert.ok(steps < 5000, `seed ${seed} no termina`);
      const ids = Object.keys(s.players);
      const pick = (arr) => arr[Math.floor(rng() * arr.length)];
      // Responder preguntas pendientes
      const open = Object.values(s.questions).find((q) => q.status !== 'closed');
      if (open) {
        if (open.status === 'pending') {
          const t = s.players[open.to];
          const offer = t.slices > 0 && rng() < 0.7 ? 1 + Math.floor(rng() * t.slices) : 0;
          s = respond(s, open.id, open.to, offer);
        } else {
          s = decide(s, open.id, open.from, rng() < 0.5);
        }
      } else {
        const dets = ids.filter((id) => s.players[id].role === ROLES.DETECTIVE && s.players[id].status === STATUS.ACTIVE);
        const d = pick(dets);
        const targets = ids.filter((id) => id !== d && s.players[id].status !== STATUS.ELIMINATED && !s.players[d].asked[id]);
        if (targets.length && rng() < 0.85) {
          s = ask(s, d, pick(targets));
        } else {
          const all = ids.filter((id) => id !== d && s.players[id].status !== STATUS.ELIMINATED);
          s = accuse(s, d, pick(all));
        }
      }
      assert.equal(totalSlicesInPlay(s).total, s.settings.totalSlices);
      const nb = s.phase === 'playing' ? remainingQuestionBound(s) : 0;
      assert.ok(nb <= bound);
      bound = nb;
    }
    assert.ok(['thief', 'detectives'].includes(s.winner));
  }
});

test('setHostPlays solo en el lobby', () => {
  const s = setHostPlays(lobby(3), false);
  assert.equal(s.settings.hostPlays, false);
  const started = startGame(lobby(3), { accomplices: 0, totalSlices: 12 });
  assert.throws(() => setHostPlays(started, false), GameError);
});

test('pasar tarta: solo dentro de la banda y con trozos suficientes', () => {
  const { s, thief, accs, dets } = setup();
  assert.throws(() => give(s, thief, dets[0], 1), GameError);
  assert.throws(() => give(s, dets[0], thief, 1), GameError);
  assert.throws(() => give(s, thief, accs[0], 13), GameError);
  assert.throws(() => give(s, thief, '__proto__', 1), GameError);
  assert.equal(give(s, thief, accs[0], 2).players[accs[0]].slices, 2);
});

test('el registro privado solo lo ven las implicadas', () => {
  let { s, thief, dets } = setup();
  s = ask(s, dets[0], thief);
  const priv = s.log.filter((e) => e.audience);
  assert.equal(priv.length, 1);
  assert.ok(visibleLog(s, dets[0]).includes(priv[0]));
  assert.ok(visibleLog(s, thief).includes(priv[0]));
  assert.ok(!visibleLog(s, dets[1]).includes(priv[0]));
});
