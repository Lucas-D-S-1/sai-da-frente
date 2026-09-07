/* Regras versionadas do racha. Sem rede: links transportam as jogadas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RushCompetition = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 1;
  const MAX_MOVES = 300;
  function today(now = new Date()) { return now.toISOString().slice(0, 10); }
  function validDate(date) {
    return typeof date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  }
  function stages(date) {
    if (!validDate(date)) throw new Error('Data inválida.');
    let seed = 2166136261;
    for (const char of 'racha-v1-' + date) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    return [[8, 16], [24, 18], [42, 18]].map(([start, size]) => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return start + (seed >>> 0) % size;
    });
  }
  function compare(a, b) { return a.m - b.m || a.t - b.t; }
  function formatTime(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function nickname(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 20) || 'Piloto';
  }
  function encode(result) {
    return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(result))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(token) {
    if (typeof token !== 'string' || token.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('Resultado inválido.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))));
  }
  function verify(result, levels, engine) {
    if (!result || result.v !== VERSION || !validDate(result.d) ||
        typeof result.n !== 'string' || result.n !== nickname(result.n) ||
        !Number.isInteger(result.m) || result.m < 3 || result.m > MAX_MOVES * 3 ||
        !Number.isInteger(result.t) || result.t < 0 || result.t > 7 * 86400000 ||
        !Array.isArray(result.p) || result.p.length !== 3) throw new Error('Resultado inválido.');
    let moves = 0;
    stages(result.d).forEach((levelIndex, stage) => {
      const trace = result.p[stage];
      if (typeof trace !== 'string' || !/^[0-9a-z]+$/.test(trace) || trace.length % 2 || trace.length > MAX_MOVES * 2) throw new Error('Jogadas inválidas.');
      const pieces = engine.parseBoard(levels[levelIndex].b);
      for (let i = 0; i < trace.length; i += 2) {
        const pi = parseInt(trace[i], 36), to = parseInt(trace[i + 1], 36);
        const world = engine.createWorld(pieces);
        if (world.solved(world.start)) throw new Error('Jogadas após a vitória.');
        const buf = new Int32Array(pieces.length * 12), count = world.moves(world.start, buf);
        let legal = false;
        for (let j = 0; j < count; j += 2) if (buf[j] === pi && buf[j + 1] === to) legal = true;
        if (!legal) throw new Error('Jogada impossível.');
        pieces[pi].pos = to;
        moves++;
      }
      const world = engine.createWorld(pieces);
      if (!world.solved(world.start)) throw new Error('Fase incompleta.');
    });
    if (moves !== result.m) throw new Error('Pontuação inconsistente.');
    return { v: VERSION, d: result.d, n: result.n, m: result.m, t: result.t, p: result.p.slice() };
  }
  function medal(moves, optimal) {
    return moves === optimal ? 'Ouro · rota perfeita' : moves <= Math.ceil(optimal * 1.25) ? 'Prata · boa estratégia' : 'Bronze · racha concluído';
  }
  function streak(dates, currentDate) {
    const unique = new Set(dates.filter(validDate));
    let day = Date.parse(currentDate), count = 0;
    if (!unique.has(today(new Date(day)))) day -= 86400000;
    while (unique.has(today(new Date(day)))) { count++; day -= 86400000; }
    return count;
  }
  return { VERSION, MAX_MOVES, today, validDate, stages, compare, formatTime, nickname, encode, decode, verify, medal, streak };
});
