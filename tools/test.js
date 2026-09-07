const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const E = require('../js/engine');
const C = require('../js/competition');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/levels.js'), 'utf8'), context);
const levels = context.window.RUSH_LEVELS;
const solutions = levels.map(l => E.solve(E.parseBoard(l.b)));
const date = '2026-09-07';
function result() {
  const indices = C.stages(date);
  return { v: 1, d: date, n: 'Lucas 🏁', t: 120000,
    m: indices.reduce((sum, i) => sum + solutions[i].minMoves, 0),
    p: indices.map(i => solutions[i].solution.map(m => m.piece.toString(36) + m.to.toString(36)).join('')) };
}
test('72 fases únicas: mínimo, jogadas legais e vitória em cada solução', () => {
  assert.equal(levels.length, 72);
  assert.equal(new Set(levels.map(l => E.canonicalKey(E.parseBoard(l.b)))).size, 72);
  levels.forEach((l, i) => {
    assert(solutions[i]); assert.equal(solutions[i].minMoves, l.m);
    const pieces = E.parseBoard(l.b);
    for (const move of solutions[i].solution) {
      const w = E.createWorld(pieces), buf = new Int32Array(pieces.length * 12);
      const count = w.moves(w.start, buf);
      let legal = false;
      for (let j = 0; j < count; j += 2) if (buf[j] === move.piece && buf[j + 1] === move.to) legal = true;
      assert(legal); pieces[move.piece].pos = move.to; E.toBoardString(pieces);
    }
    const w = E.createWorld(pieces); assert(w.solved(w.start));
  });
});
test('datas e três faixas determinísticas, independentes do fuso', () => {
  assert.equal(C.today(new Date('2026-09-06T21:00:00-03:00')), date);
  assert(!C.validDate('2026-02-30')); assert(!C.validDate('garbage'));
  const chosen = C.stages(date); assert.deepEqual(chosen, C.stages(date));
  assert(chosen[0] >= 8 && chosen[0] < 24);
  assert(chosen[1] >= 24 && chosen[1] < 42);
  assert(chosen[2] >= 42 && chosen[2] < 60);
  // Fixture freezes v1 links against accidental changes to the date mapping.
  assert.deepEqual(C.stages(date), [10, 27, 48]);
});
test('resultado UTF-8 viaja por link e suas três soluções são verificadas', () => {
  const r = result(); assert.deepEqual(C.decode(C.encode(r)), r);
  assert.deepEqual(C.verify(r, levels, E), r);
});
test('rejeita pontos inventados, fases incompletas, movimentos impossíveis e links enormes', () => {
  const r = result();
  assert.throws(() => C.verify({ ...r, m: r.m - 1 }, levels, E));
  assert.throws(() => C.verify({ ...r, p: ['zz', ...r.p.slice(1)] }, levels, E));
  assert.throws(() => C.verify({ ...r, p: [r.p[0].slice(0, -2), ...r.p.slice(1)] }, levels, E));
  assert.throws(() => C.verify({ ...r, p: [r.p[0] + '00', ...r.p.slice(1)] }, levels, E));
  assert.throws(() => C.verify({ ...r, t: -1 }, levels, E));
  assert.throws(() => C.verify({ ...r, v: 2 }, levels, E));
  assert.throws(() => C.decode('a'.repeat(4001)));
});
test('menos movimentos vence, mesmo com tempo maior; empate usa tempo', () => {
  assert(C.compare({m:40,t:999999}, {m:41,t:1}) < 0);
  assert(C.compare({m:40,t:1000}, {m:40,t:2000}) < 0);
  assert.equal(C.compare({m:40,t:1000}, {m:40,t:1000}), 0);
});
test('medalhas e sequência não dão crédito duplicado por repetir o mesmo dia', () => {
  assert.match(C.medal(40,40), /Ouro/); assert.match(C.medal(45,40), /Prata/); assert.match(C.medal(70,40), /Bronze/);
  assert.equal(C.streak(['2026-09-06','2026-09-06','2026-09-07'], date), 2);
  assert.equal(C.streak(['2026-09-05','2026-09-06'], date), 2);
  assert.equal(C.streak(['2026-09-05'], date), 0);
});
test('limite do solucionador é respeitado', () => {
  assert.equal(E.solve(E.parseBoard(levels[10].b), {maxStates:1}), null);
});
