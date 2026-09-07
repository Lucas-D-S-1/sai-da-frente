/*
 * Hora do Rush — motor do jogo (regras + solucionador ótimo)
 *
 * Funciona no navegador (define window.RushEngine) e no Node (module.exports),
 * sem build, sem dependências.
 *
 * Convenções (baseadas no Rush Hour original da ThinkFun):
 *   - tabuleiro 6x6, células indexadas por r*6+c (r=0 no topo, c=0 à esquerda)
 *   - o carro herói é sempre horizontal, tem 2 células e fica na linha 2 (3ª linha)
 *   - a saída fica na borda direita da linha 2
 *   - peças deslizam apenas no próprio eixo; nunca giram nem se atravessam
 *   - um MOVIMENTO = deslizar uma peça qualquer distância numa direção
 *     (é essa a métrica usada para classificar dificuldade no jogo físico)
 *
 * Formato de texto do tabuleiro: 36 caracteres, 'o' = vazio, 'A' = herói,
 * 'B'..'Z' = demais veículos (letras contíguas ocupadas pela mesma peça).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RushEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 6;
  var CELLS = SIZE * SIZE;
  var EXIT_ROW = 2;
  var HERO = 0;

  // ---------------------------------------------------------------------------
  // Representação
  // ---------------------------------------------------------------------------
  // Uma peça é { len, horiz, fixed, pos }:
  //   horiz=true  -> ocupa (fixed, pos .. pos+len-1)   [fixed é a linha]
  //   horiz=false -> ocupa (pos .. pos+len-1, fixed)   [fixed é a coluna]
  // "pos" é a única coordenada que varia — é o estado do quebra-cabeça.

  function makePiece(len, horiz, row, col) {
    return {
      len: len,
      horiz: horiz,
      fixed: horiz ? row : col,
      pos: horiz ? col : row,
    };
  }

  function pieceRow(p) { return p.horiz ? p.fixed : p.pos; }
  function pieceCol(p) { return p.horiz ? p.pos : p.fixed; }

  function clonePieces(pieces) {
    var out = new Array(pieces.length);
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      out[i] = { len: p.len, horiz: p.horiz, fixed: p.fixed, pos: p.pos };
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Texto <-> peças
  // ---------------------------------------------------------------------------

  function parseBoard(str) {
    var s = String(str).replace(/\s+/g, '');
    if (s.length !== CELLS) throw new Error('tabuleiro precisa de ' + CELLS + ' caracteres, veio ' + s.length);
    var seen = Object.create(null);
    var order = [];
    for (var i = 0; i < CELLS; i++) {
      var ch = s[i];
      if (ch === 'o' || ch === '.') continue;
      if (!seen[ch]) { seen[ch] = []; order.push(ch); }
      seen[ch].push(i);
    }
    if (order.indexOf('A') === -1) throw new Error("tabuleiro sem carro herói ('A')");
    // herói primeiro, depois o resto na ordem em que aparece
    order.sort(function (a, b) { return (a === 'A' ? -1 : b === 'A' ? 1 : 0); });

    var pieces = order.map(function (ch) {
      var cells = seen[ch];
      var len = cells.length;
      if (len < 2 || len > 3) throw new Error("peça '" + ch + "' com tamanho inválido: " + len);
      var r0 = (cells[0] / SIZE) | 0, c0 = cells[0] % SIZE;
      var horiz = cells[1] === cells[0] + 1;
      for (var k = 1; k < len; k++) {
        var expected = horiz ? cells[0] + k : cells[0] + k * SIZE;
        if (cells[k] !== expected) throw new Error("peça '" + ch + "' não é contígua/reta");
      }
      if (horiz && c0 + len > SIZE) throw new Error("peça '" + ch + "' sai do tabuleiro");
      return makePiece(len, horiz, r0, c0);
    });

    var hero = pieces[0];
    if (!hero.horiz || hero.len !== 2 || hero.fixed !== EXIT_ROW) {
      throw new Error('o herói precisa ser horizontal, de tamanho 2, na linha ' + EXIT_ROW);
    }
    return pieces;
  }

  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function toBoardString(pieces) {
    var g = new Array(CELLS).fill('o');
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i], ch = LETTERS[i] || '?';
      for (var k = 0; k < p.len; k++) {
        var idx = p.horiz ? p.fixed * SIZE + p.pos + k : (p.pos + k) * SIZE + p.fixed;
        if (g[idx] !== 'o') throw new Error('peças sobrepostas em ' + idx);
        g[idx] = ch;
      }
    }
    return g.join('');
  }

  /* Chave canônica: independe da ordem em que as peças foram listadas.
     Usada para deduplicar fases geradas. */
  function canonicalKey(pieces) {
    var g = new Array(CELLS).fill(0);
    var rest = [];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      var head = p.horiz ? p.fixed * SIZE + p.pos : p.pos * SIZE + p.fixed;
      if (i === HERO) { paint(g, p, 'A'); } else { rest.push({ head: head, p: p }); }
    }
    rest.sort(function (a, b) { return a.head - b.head; });
    for (var j = 0; j < rest.length; j++) paint(g, rest[j].p, LETTERS[j + 1] || '?');
    return g.map(function (c) { return c === 0 ? 'o' : c; }).join('');

    function paint(grid, p, ch) {
      for (var k = 0; k < p.len; k++) {
        var idx = p.horiz ? p.fixed * SIZE + p.pos + k : (p.pos + k) * SIZE + p.fixed;
        grid[idx] = ch;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Núcleo rápido: um "mundo" com metadados fixos e estados como Uint8Array
  // ---------------------------------------------------------------------------

  function createWorld(pieces) {
    var n = pieces.length;
    var len = new Uint8Array(n);
    var horiz = new Uint8Array(n);
    var fixed = new Uint8Array(n);
    var start = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      len[i] = pieces[i].len;
      horiz[i] = pieces[i].horiz ? 1 : 0;
      fixed[i] = pieces[i].fixed;
      start[i] = pieces[i].pos;
    }
    var heroGoal = SIZE - len[HERO]; // herói encostado na borda direita = resolvido
    var grid = new Uint8Array(CELLS);

    function paint(pos) {
      grid.fill(0);
      for (var i = 0; i < n; i++) {
        var L = len[i];
        if (horiz[i]) {
          var base = fixed[i] * SIZE + pos[i];
          for (var k = 0; k < L; k++) grid[base + k] = i + 1;
        } else {
          var b = pos[i] * SIZE + fixed[i];
          for (var m = 0; m < L; m++) grid[b + m * SIZE] = i + 1;
        }
      }
    }

    /* Preenche `out` com [pieceIndex, novaPos, ...] de todos os movimentos legais.
       Devolve a quantidade de pares. Um movimento = deslizar 1..k células. */
    function moves(pos, out) {
      paint(pos);
      var count = 0;
      for (var i = 0; i < n; i++) {
        var L = len[i], P = pos[i];
        if (horiz[i]) {
          var row = fixed[i] * SIZE;
          for (var c = P - 1; c >= 0 && grid[row + c] === 0; c--) { out[count++] = i; out[count++] = c; }
          for (var c2 = P + L; c2 < SIZE && grid[row + c2] === 0; c2++) { out[count++] = i; out[count++] = c2 - L + 1; }
        } else {
          var col = fixed[i];
          for (var r = P - 1; r >= 0 && grid[r * SIZE + col] === 0; r--) { out[count++] = i; out[count++] = r; }
          for (var r2 = P + L; r2 < SIZE && grid[r2 * SIZE + col] === 0; r2++) { out[count++] = i; out[count++] = r2 - L + 1; }
        }
      }
      return count;
    }

    // Chave numérica em base 6. Cada peça tem posição 0..5 e n <= 16, logo
    // 6^16 ~ 2.8e12 cabe com folga no inteiro seguro do JS — e um Map de
    // números é bem mais rápido que um Map de strings.
    function key(pos) {
      var k = 0;
      for (var i = 0; i < n; i++) k = k * 6 + pos[i];
      return k;
    }

    function solved(pos) { return pos[HERO] === heroGoal; }

    /* O caminho do herói até a saída está livre? (usado só para efeitos visuais) */
    function heroPathClear(pos) {
      paint(pos);
      for (var c = pos[HERO] + len[HERO]; c < SIZE; c++) {
        if (grid[EXIT_ROW * SIZE + c] !== 0) return false;
      }
      return true;
    }

    return {
      n: n, len: len, horiz: horiz, fixed: fixed, start: start,
      heroGoal: heroGoal, moves: moves, key: key, solved: solved,
      paint: paint, grid: grid, heroPathClear: heroPathClear,
    };
  }

  // ---------------------------------------------------------------------------
  // Solucionador: BFS sobre movimentos -> solução ótima garantida
  // ---------------------------------------------------------------------------

  var MAX_STATES = 900000;

  /* Devolve { minMoves, solution: [{piece, from, to}], states } ou null se
     não houver solução (ou se o espaço de estados estourar o limite). */
  function solve(pieces, opts) {
    opts = opts || {};
    var limit = opts.maxStates || MAX_STATES;
    var w = createWorld(pieces);
    var n = w.n;

    var startKey = w.key(w.start);
    if (w.solved(w.start)) return { minMoves: 0, solution: [], states: 1 };

    var prev = new Map();          // key -> { k: chaveAnterior, piece, from, to }
    prev.set(startKey, null);
    var frontier = [w.start];
    var buf = new Int32Array(n * 12);
    var depth = 0;

    while (frontier.length) {
      var next = [];
      depth++;
      for (var f = 0; f < frontier.length; f++) {
        var pos = frontier[f];
        var pk = w.key(pos);
        var cnt = w.moves(pos, buf);
        for (var m = 0; m < cnt; m += 2) {
          var pi = buf[m], np = buf[m + 1];
          var child = pos.slice();
          child[pi] = np;
          var ck = w.key(child);
          if (prev.has(ck)) continue;
          if (prev.size >= limit) return null;
          prev.set(ck, { k: pk, piece: pi, from: pos[pi], to: np });
          if (w.solved(child)) {
            return { minMoves: depth, solution: rebuild(prev, ck), states: prev.size };
          }
          next.push(child);
        }
      }
      if (prev.size > limit) return null;
      frontier = next;
    }
    return null;
  }

  function rebuild(prev, endKey) {
    var path = [];
    var k = endKey;
    while (true) {
      var step = prev.get(k);
      if (!step) break;
      path.push({ piece: step.piece, from: step.from, to: step.to });
      k = step.k;
    }
    path.reverse();
    return path;
  }

  /* Só a distância ótima (mais barato que solve quando não precisamos do caminho). */
  function minMoves(pieces, opts) {
    var r = solve(pieces, opts);
    return r ? r.minMoves : null;
  }

  // ---------------------------------------------------------------------------
  // Análise do componente conexo (usada pelo gerador de fases)
  // ---------------------------------------------------------------------------
  //
  // Todo movimento é reversível, logo o grafo de estados é NÃO DIRIGIDO. Isso
  // permite, com UMA busca, mapear todo o componente alcançável a partir de um
  // arranjo qualquer e, com uma segunda busca em largura multi-origem partindo
  // de TODOS os estados vitoriosos, obter a distância ótima de cada estado até
  // a vitória. O estado mais distante é o quebra-cabeça mais difícil possível
  // para aquele conjunto de peças — e já vem com o número mínimo de movimentos
  // provado.

  function analyzeComponent(pieces, opts) {
    opts = opts || {};
    var limit = opts.maxStates || 300000;
    var w = createWorld(pieces);
    var n = w.n;

    var index = new Map();   // chave -> id
    var states = [];         // id -> Uint8Array
    var buf = new Int32Array(n * 12);

    index.set(w.key(w.start), 0);
    states.push(w.start);

    // 1ª passada: descobre todo o componente alcançável
    for (var head = 0; head < states.length; head++) {
      if (states.length > limit) return null; // conjunto de peças grande demais
      var pos = states[head];
      var cnt = w.moves(pos, buf);
      for (var m = 0; m < cnt; m += 2) {
        var child = pos.slice();
        child[buf[m]] = buf[m + 1];
        var ck = w.key(child);
        if (!index.has(ck)) { index.set(ck, states.length); states.push(child); }
      }
    }

    // 2ª passada: BFS multi-origem a partir de TODOS os estados vitoriosos.
    // Os vizinhos são recalculados em vez de guardados — o grafo tem ~10x mais
    // arestas que vértices e guardá-lo estoura a memória sem ganho de tempo.
    var total = states.length;
    var dist = new Int32Array(total).fill(-1);
    var wave = new Int32Array(total);
    var tail = 0;
    for (var i = 0; i < total; i++) {
      if (w.solved(states[i])) { dist[i] = 0; wave[tail++] = i; }
    }
    if (!tail) return null; // componente sem vitória: descartar

    for (var h = 0; h < tail; h++) {
      var cur = wave[h], d = dist[cur] + 1, cpos = states[cur];
      var c2 = w.moves(cpos, buf);
      for (var j = 0; j < c2; j += 2) {
        var nb = cpos.slice();
        nb[buf[j]] = buf[j + 1];
        var nid = index.get(w.key(nb));
        if (nid !== undefined && dist[nid] === -1) { dist[nid] = d; wave[tail++] = nid; }
      }
    }

    return { world: w, states: states, dist: dist, size: total, index: index };
  }

  /* Reconstrói um array de peças a partir de um vetor de posições. */
  function piecesFromPositions(pieces, pos) {
    var out = clonePieces(pieces);
    for (var i = 0; i < out.length; i++) out[i].pos = pos[i];
    return out;
  }

  return {
    SIZE: SIZE,
    CELLS: CELLS,
    EXIT_ROW: EXIT_ROW,
    HERO: HERO,
    LETTERS: LETTERS,
    makePiece: makePiece,
    pieceRow: pieceRow,
    pieceCol: pieceCol,
    clonePieces: clonePieces,
    parseBoard: parseBoard,
    toBoardString: toBoardString,
    canonicalKey: canonicalKey,
    createWorld: createWorld,
    solve: solve,
    minMoves: minMoves,
    analyzeComponent: analyzeComponent,
    piecesFromPositions: piecesFromPositions,
  };
});
