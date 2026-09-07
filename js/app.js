(function () {
  'use strict';

  const Engine = window.RushEngine;
  const Competition = window.RushCompetition;
  const Room = window.RushRoom;
  const $ = (id) => document.getElementById(id);
  const LEVELS = Array.isArray(window.RUSH_LEVELS) ? window.RUSH_LEVELS : [];
  const TIERS = Array.isArray(window.RUSH_TIERS) ? window.RUSH_TIERS : [];
  const STORAGE_KEY = 'sai-da-frente-progress-v1';
  const COLORS = [
    { label: 'azul', body: '#2d84c6', dark: '#15527f', glass: '#9dd9ee' },
    { label: 'amarelo', body: '#e69f00', dark: '#9b6200', glass: '#ffe0a0' },
    { label: 'verde', body: '#168a61', dark: '#09583e', glass: '#a2e4c8' },
    { label: 'azul-claro', body: '#56b4e9', dark: '#27799f', glass: '#c2efff' },
    { label: 'roxo', body: '#6551a6', dark: '#37286e', glass: '#c1b9ed' },
    { label: 'rosa', body: '#cc79a7', dark: '#86436b', glass: '#f5c1dd' },
    { label: 'creme', body: '#e4e0d4', dark: '#99978f', glass: '#ffffff' },
    { label: 'turquesa', body: '#36a898', dark: '#176b63', glass: '#b8f0df' },
    { label: 'vinho', body: '#8d315c', dark: '#531a3a', glass: '#e9a0bb' },
    { label: 'oliva', body: '#82750f', dark: '#4e4706', glass: '#dbd57f' },
    { label: 'lilás', body: '#8d71be', dark: '#56417d', glass: '#d7c9fa' },
    { label: 'laranja', body: '#dc6d2f', dark: '#8c351d', glass: '#ffd0a7' },
  ];

  const dom = {
    board: document.getElementById('board'),
    tierName: document.getElementById('tierName'),
    levelTitle: document.getElementById('levelTitle'),
    levelDescription: document.getElementById('levelDescription'),
    levelNumber: document.getElementById('levelNumber'),
    progressCount: document.getElementById('progressCount'),
    progressTier: document.getElementById('progressTier'),
    tierChip: document.getElementById('tierChip'),
    progressBar: document.getElementById('progressBar'),
    progressCaption: document.getElementById('progressCaption'),
    moveCount: document.getElementById('moveCount'),
    optimalCount: document.getElementById('optimalCount'),
    bestCount: document.getElementById('bestCount'),
    tipCard: document.getElementById('tipCard'),
    tipTitle: document.getElementById('tipTitle'),
    tipText: document.getElementById('tipText'),
    undoButton: document.getElementById('undoButton'),
    redoButton: document.getElementById('redoButton'),
    restartButton: document.getElementById('restartButton'),
    hintButton: document.getElementById('hintButton'),
    soundButton: document.getElementById('soundButton'),
    soundIcon: document.getElementById('soundIcon'),
    soundLabel: document.getElementById('soundLabel'),
    levelMenuButton: document.getElementById('levelMenuButton'),
    helpButton: document.getElementById('helpButton'),
    liveRegion: document.getElementById('liveRegion'),
    toast: document.getElementById('toast'),
    levelModal: document.getElementById('levelModal'),
    levelsList: document.getElementById('levelsList'),
    closeLevelModal: document.getElementById('closeLevelModal'),
    helpModal: document.getElementById('helpModal'),
    closeHelpModal: document.getElementById('closeHelpModal'),
    closeHelpAction: document.getElementById('closeHelpAction'),
    winModal: document.getElementById('winModal'),
    winScore: document.getElementById('winScore'),
    winStars: document.getElementById('winStars'),
    winNote: document.getElementById('winNote'),
    winReplayButton: document.getElementById('winReplayButton'),
    nextLevelButton: document.getElementById('nextLevelButton'),
  };

  const state = {
    current: 0,
    pieces: [],
    startPieces: [],
    elements: [],
    selected: 0,
    moves: 0,
    history: [],
    redo: [],
    hint: null,
    hintsUsed: 0,
    won: false,
    busy: false,
    drag: null,
    progress: readProgress(),
    sound: false,
    reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    toastTimer: null,
    audioContext: null,
    winTimer: null,
    generation: 0,
    focusReturn: null,
  };

  const raceStore = readRaceStore();
  const race = { active: false, date: Competition.today(), stage: 0, status: 'ready',
    totalMoves: 0, elapsed: 0, started: 0, traces: [], imported: null, result: null };

  state.sound = Boolean(state.progress.settings.sound);
  state.reducedMotion = Boolean(state.progress.settings.reducedMotion) || state.reducedMotion;

  function defaultProgress() {
    return {
      v: 1,
      levels: {},
      unlocked: 1,
      current: 0,
      settings: { sound: false, reducedMotion: false },
    };
  }

  function readProgress() {
    const fallback = defaultProgress();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const result = defaultProgress();
      if (!parsed || typeof parsed !== 'object') return result;
      const entries = parsed.levels && typeof parsed.levels === 'object' ? parsed.levels : {};
      for (let i = 0; i < LEVELS.length; i++) {
        const entry = entries[i];
        if (entry && entry.solved && Number.isInteger(entry.bestMoves) && entry.bestMoves >= LEVELS[i].m) {
          result.levels[i] = { solved: true, bestMoves: entry.bestMoves,
            stars: Math.max(1, Math.min(3, Math.floor(Number(entry.stars)) || 1)) };
        }
      }
      result.settings = { sound: parsed.settings?.sound === true, reducedMotion: parsed.settings?.reducedMotion === true };
      while (result.unlocked < LEVELS.length && result.levels[result.unlocked - 1]?.solved) result.unlocked++;
      result.current = Number.isInteger(parsed.current) ? Math.max(0, Math.min(result.unlocked - 1, parsed.current)) : 0;
      return result;
    } catch (error) {
      return fallback;
    }
  }

  function saveProgress() {
    if (!race.active) state.progress.current = state.current;
    state.progress.settings.sound = state.sound;
    state.progress.settings.reducedMotion = state.reducedMotion;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    } catch (error) {
      // file:// and privacy modes may deny storage; the game remains playable.
    }
  }

  function tierFor(index) {
    let offset = 0;
    for (let i = 0; i < TIERS.length; i += 1) {
      const tier = TIERS[i];
      const end = offset + Number(tier.levels || 0);
      if (index < end) return { tier, local: index - offset, offset };
      offset = end;
    }
    return { tier: TIERS[TIERS.length - 1] || { id: 'desafio', nome: 'Desafio', levels: LEVELS.length }, local: 0, offset: 0 };
  }

  function formatNumber(number) {
    return String(number).padStart(2, '0');
  }

  function clonePieces(pieces) {
    return Engine.clonePieces(pieces);
  }

  function positionsOf(pieces) {
    return pieces.map((piece) => piece.pos);
  }

  function currentLevel() {
    return LEVELS[state.current] || { b: 'o'.repeat(12) + 'AA' + 'o'.repeat(22), m: 0, t: 'desafio' };
  }

  function colorFor(pieceIndex) {
    if (pieceIndex === Engine.HERO) return { label: 'vermelho', body: '#e6483e', dark: '#a92f31', glass: '#ffb0a1' };
    return COLORS[(pieceIndex - 1) % COLORS.length];
  }

  function pieceName(index, piece) {
    if (index === Engine.HERO) return 'carro vermelho';
    const color = colorFor(index);
    return `${piece.len === 3 ? 'caminhão' : 'carro'} ${color.label}`;
  }

  function announce(message) {
    dom.liveRegion.textContent = '';
    window.setTimeout(() => {
      dom.liveRegion.textContent = message;
    }, 20);
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), 2500);
  }

  function setTip(title, text) {
    dom.tipTitle.textContent = title;
    dom.tipText.textContent = text;
  }

  function setSelected(index, shouldFocus) {
    state.selected = index;
    state.elements.forEach((element, elementIndex) => {
      const active = elementIndex === index;
      element.classList.toggle('is-selected', active);
      element.tabIndex = 0;
    });
    if (shouldFocus && state.elements[index]) {
      state.elements[index].focus({ preventScroll: true });
    }
  }

  function applyPosition(element, piece, position) {
    const col = piece.horiz ? position : piece.fixed;
    const row = piece.horiz ? piece.fixed : position;
    const width = piece.horiz ? piece.len : 1;
    const height = piece.horiz ? 1 : piece.len;
    element.style.left = `${(col * 100) / 6}%`;
    element.style.top = `${(row * 100) / 6}%`;
    element.style.width = `${(width * 100) / 6}%`;
    element.style.height = `${(height * 100) / 6}%`;
  }

  function directionFor(move) {
    if (move.to === move.from) return '';
    const piece = state.pieces[move.piece];
    if (piece.horiz) return move.to > move.from ? '→' : '←';
    return move.to > move.from ? '↓' : '↑';
  }

  function buildPieceElement(piece, index) {
    const element = document.createElement('button');
    const horizontal = piece.horiz;
    const color = colorFor(index);
    element.type = 'button';
    element.className = `piece ${horizontal ? 'horizontal' : 'vertical'} ${index === Engine.HERO ? 'hero' : ''}`;
    element.dataset.piece = String(index);
    element.setAttribute('aria-label', `${pieceName(index, piece)}. ${horizontal ? 'Horizontal' : 'Vertical'}.`);
    element.tabIndex = 0;
    element.style.setProperty('--paint', color.body);
    element.style.setProperty('--paint-dark', color.dark);
    element.style.setProperty('--glass', color.glass);

    const body = document.createElement('span');
    body.className = 'vehicle-body';
    const mark = document.createElement('span');
    mark.className = 'vehicle-mark';
    mark.textContent = index === Engine.HERO ? '→' : '•';
    body.appendChild(mark);
    element.appendChild(body);

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerCancel);
    element.addEventListener('lostpointercapture', onLostPointerCapture);
    element.addEventListener('focus', () => setSelected(index, false));
    element.addEventListener('keydown', onPieceKeyDown);
    element.addEventListener('click', () => setSelected(index, false));
    return element;
  }

  function renderPieces(keepFocus) {
    const activeElement = document.activeElement;
    const activeIndex = activeElement && activeElement.dataset ? Number(activeElement.dataset.piece) : state.selected;
    dom.board.replaceChildren();
    state.elements = state.pieces.map((piece, index) => {
      const element = buildPieceElement(piece, index);
      applyPosition(element, piece, piece.pos);
      if (state.hint && state.hint.piece === index) {
        element.classList.add('hinted');
        const arrow = document.createElement('span');
        arrow.className = 'hint-arrow';
        arrow.textContent = directionFor(state.hint);
        arrow.setAttribute('aria-hidden', 'true');
        element.appendChild(arrow);
      }
      dom.board.appendChild(element);
      return element;
    });
    state.selected = Math.max(0, Math.min(state.pieces.length - 1, state.selected));
    setSelected(state.selected, false);
    if (keepFocus && activeIndex >= 0 && state.elements[activeIndex]) {
      state.elements[activeIndex].focus({ preventScroll: true });
    }
  }

  function getMoveRange(pieceIndex) {
    const pieces = state.pieces;
    const piece = pieces[pieceIndex];
    const world = Engine.createWorld(pieces);
    world.paint(positionsOf(pieces));
    let min = piece.pos;
    let max = piece.pos;
    if (piece.horiz) {
      const row = piece.fixed * Engine.SIZE;
      for (let col = piece.pos - 1; col >= 0 && world.grid[row + col] === 0; col -= 1) min = col;
      for (let col = piece.pos + piece.len; col < Engine.SIZE && world.grid[row + col] === 0; col += 1) max = col - piece.len + 1;
    } else {
      const col = piece.fixed;
      for (let row = piece.pos - 1; row >= 0 && world.grid[row * Engine.SIZE + col] === 0; row -= 1) min = row;
      for (let row = piece.pos + piece.len; row < Engine.SIZE && world.grid[row * Engine.SIZE + col] === 0; row += 1) max = row - piece.len + 1;
    }
    return { min, max };
  }

  function isSolved() {
    return state.pieces[Engine.HERO] && state.pieces[Engine.HERO].pos === Engine.SIZE - state.pieces[Engine.HERO].len;
  }

  function pulseBlocked() {
    dom.board.classList.remove('is-blocked');
    void dom.board.offsetWidth;
    dom.board.classList.add('is-blocked');
    window.setTimeout(() => dom.board.classList.remove('is-blocked'), 150);
    playTone('blocked');
  }

  function commitMove(pieceIndex, target, source) {
    if (Room.active && Room.paused) {
      showToast('A partida está pausada pelo anfitrião.');
      return false;
    }
    if (state.won || state.busy || (race.active && race.status !== 'playing')) return false;
    if (race.active && state.moves >= Competition.MAX_MOVES) { showToast('Limite de 300 movimentos nesta etapa. Comece outra tentativa.'); return false; }
    const piece = state.pieces[pieceIndex];
    if (!piece) return false;
    const range = getMoveRange(pieceIndex);
    const next = Math.max(range.min, Math.min(range.max, target));
    if (next === piece.pos) {
      pulseBlocked();
      announce(`${pieceName(pieceIndex, piece)} não pode ir mais longe nessa direção.`);
      return false;
    }
    const from = piece.pos;
    state.history.push({ piece: pieceIndex, from, to: next });
    state.redo = [];
    state.hint = null;
    state.pieces[pieceIndex].pos = next;
    state.moves += 1;
    renderPieces(true);
    updateHud();
    playTone('move');
    announce(`${pieceName(pieceIndex, piece)} moveu. Movimento ${state.moves}.`);
    if (source === 'keyboard') {
      showToast(`${pieceName(pieceIndex, piece)}: ${directionName(piece, next > from ? 1 : -1)}.`);
    }
    if (isSolved()) handleWin();
    saveRoomCheckpoint();
    return true;
  }

  function directionName(piece, sign) {
    if (piece.horiz) return sign > 0 ? 'para a direita' : 'para a esquerda';
    return sign > 0 ? 'para baixo' : 'para cima';
  }

  function onPieceKeyDown(event) {
    const index = Number(event.currentTarget.dataset.piece);
    setSelected(index, false);
    if (Room.active && Room.paused) {
      if (event.key.startsWith('Arrow')) event.preventDefault();
      showToast('A partida está pausada pelo anfitrião.');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      showToast('Use as setas para mover este veículo.');
      return;
    }
    const keyMap = { ArrowLeft: [-1, true], ArrowRight: [1, true], ArrowUp: [-1, false], ArrowDown: [1, false] };
    const mapped = keyMap[event.key];
    if (!mapped) return;
    event.preventDefault();
    const piece = state.pieces[index];
    if (piece.horiz !== mapped[1]) {
      announce(`${pieceName(index, piece)} só se move ${piece.horiz ? 'para os lados' : 'para cima e para baixo'}.`);
      pulseBlocked();
      return;
    }
    const range = getMoveRange(index);
    const target = event.shiftKey ? (mapped[0] > 0 ? range.max : range.min) : piece.pos + mapped[0];
    commitMove(index, target, 'keyboard');
  }

  function onPointerDown(event) {
    if (state.won || state.busy || state.drag || (Room.active && Room.paused)) return;
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const index = Number(event.currentTarget.dataset.piece);
    const piece = state.pieces[index];
    const rect = dom.board.getBoundingClientRect();
    const range = getMoveRange(index);
    setSelected(index, false);
    event.currentTarget.focus({ preventScroll: true });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is not available in a few embedded webviews.
    }
    state.drag = {
      index,
      pointerId: event.pointerId,
      element: event.currentTarget,
      startAxis: piece.horiz ? event.clientX : event.clientY,
      startPos: piece.pos,
      preview: piece.pos,
      min: range.min,
      max: range.max,
      cell: rect.width / Engine.SIZE,
      startedAt: performance.now(),
      moved: false,
      tapX: event.clientX - rect.left,
      tapY: event.clientY - rect.top,
    };
    event.currentTarget.classList.add('is-dragging');
  }

  function onPointerMove(event) {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const piece = state.pieces[drag.index];
    const axis = piece.horiz ? event.clientX : event.clientY;
    const distance = axis - drag.startAxis;
    if (Math.abs(distance) > 5) drag.moved = true;
    const raw = drag.startPos + distance / drag.cell;
    const preview = Math.max(drag.min, Math.min(drag.max, Math.round(raw)));
    if (preview !== drag.preview) {
      drag.preview = preview;
      applyPosition(drag.element, piece, preview);
    }
    if (Math.abs(raw - drag.startPos) > Math.abs(drag.max - drag.startPos) + 0.8 || Math.abs(raw - drag.startPos) > Math.abs(drag.min - drag.startPos) + 0.8) {
      drag.pushedAgainstWall = true;
    }
  }

  function endDrag(event, cancelled) {
    const drag = state.drag;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    const piece = state.pieces[drag.index];
    const element = drag.element;
    element.classList.remove('is-dragging');
    state.drag = null;
    if (cancelled) {
      renderPieces(false);
      return;
    }
    let target = drag.preview;
    const elapsed = performance.now() - drag.startedAt;
    if (!drag.moved && elapsed < 430) {
      const rect = dom.board.getBoundingClientRect();
      const tappedAxis = piece.horiz ? event.clientX - rect.left : event.clientY - rect.top;
      const startAxis = piece.horiz ? (piece.pos * rect.width) / 6 : (piece.pos * rect.height) / 6;
      const span = piece.horiz ? (piece.len * rect.width) / 6 : (piece.len * rect.height) / 6;
      const midpoint = startAxis + span / 2;
      const deadBand = Math.max(7, span * 0.1);
      if (Math.abs(tappedAxis - midpoint) > deadBand) target = piece.pos + (tappedAxis > midpoint ? 1 : -1);
    }
    if (target !== piece.pos) {
      commitMove(drag.index, target, 'drag');
    } else {
      renderPieces(false);
      if (drag.pushedAgainstWall && drag.moved) {
        pulseBlocked();
        announce(`${pieceName(drag.index, piece)} encontrou um bloqueio.`);
      }
    }
  }

  function onPointerUp(event) {
    endDrag(event, false);
  }

  function onPointerCancel(event) {
    endDrag(event, true);
  }

  function onLostPointerCapture(event) {
    if (state.drag && state.drag.pointerId === event.pointerId) endDrag(event, true);
  }

  function undo() {
    if (race.active || !state.history.length || state.busy) return;
    clearTimeout(state.winTimer);
    const move = state.history.pop();
    state.redo.push(move);
    state.pieces[move.piece].pos = move.from;
    state.moves = Math.max(0, state.moves - 1);
    state.won = false;
    state.hint = null;
    closeModal(dom.winModal);
    renderPieces(true);
    updateHud();
    announce(`Movimento desfeito. ${state.moves} movimentos.`);
    playTone('move');
  }

  function redo() {
    if (race.active || !state.redo.length || state.busy) return;
    const move = state.redo.pop();
    state.history.push(move);
    state.pieces[move.piece].pos = move.to;
    state.moves += 1;
    state.hint = null;
    renderPieces(true);
    updateHud();
    announce(`Movimento refeito. ${state.moves} movimentos.`);
    playTone('move');
    if (isSolved()) handleWin();
  }

  function restart(showMessage) {
    if (Room.active) { closeModal(dom.winModal); return; }
    if (race.active) { enterRace(race.date); return; }
    if (state.busy) return;
    clearTimeout(state.winTimer);
    state.generation++;
    state.drag = null;
    state.pieces = clonePieces(state.startPieces);
    state.moves = 0;
    state.history = [];
    state.redo = [];
    state.hint = null;
    state.hintsUsed = 0;
    state.won = false;
    closeModal(dom.winModal);
    renderPieces(false);
    updateHud();
    if (showMessage) showToast('Fase reiniciada. Tente uma rota diferente.');
    announce('Fase reiniciada.');
  }

  function loadLevel(index) {
    if (!LEVELS.length) return;
    const requested = Math.max(0, Math.min(LEVELS.length - 1, Number(index) || 0));
    const unlockedIndex = Math.max(0, state.progress.unlocked - 1);
    if (!race.active && requested > unlockedIndex) {
      showToast('Termine as fases anteriores para liberar esta.');
      return;
    }
    clearTimeout(state.winTimer);
    state.generation++;
    state.drag = null;
    state.current = requested;
    const level = currentLevel();
    state.pieces = Engine.parseBoard(level.b);
    state.startPieces = clonePieces(state.pieces);
    state.selected = 0;
    state.moves = 0;
    state.history = [];
    state.redo = [];
    state.hint = null;
    state.hintsUsed = 0;
    state.won = false;
    state.busy = false;
    closeModal(dom.winModal);
    closeModal(dom.levelModal);
    renderPieces(false);
    updateHud();
    saveProgress();
  }

  function progressStats() {
    const solved = Object.values(state.progress.levels).filter((value) => value && value.solved).length;
    return { solved, total: LEVELS.length };
  }

  function updateHud() {
    const level = currentLevel();
    const tierInfo = tierFor(state.current);
    const solved = progressStats().solved;
    const best = state.progress.levels[state.current] && state.progress.levels[state.current].bestMoves;
    const isCurrentSolved = Boolean(state.progress.levels[state.current] && state.progress.levels[state.current].solved);
    const progressPercent = LEVELS.length ? (solved / LEVELS.length) * 100 : 0;
    const localNumber = tierInfo.local + 1;
    dom.tierName.textContent = String(tierInfo.tier.nome || 'DESAFIO').toUpperCase();
    dom.levelTitle.textContent = `Fase ${state.current + 1}`;
    dom.levelDescription.textContent = isCurrentSolved ? 'Você já liberou este caminho. Bata seu recorde.' : 'Libere o carro vermelho.';
    dom.levelNumber.textContent = formatNumber(state.current + 1);
    dom.progressCount.textContent = `${state.current + 1} / ${LEVELS.length}`;
    dom.progressTier.textContent = tierInfo.tier.nome || 'Desafio';
    dom.tierChip.textContent = `NÍVEL ${localNumber}`;
    dom.progressBar.style.width = `${progressPercent}%`;
    dom.progressCaption.textContent = solved === 0 ? 'Você está começando. Boa viagem.' : `${solved} de ${LEVELS.length} caminhos liberados.`;
    dom.moveCount.textContent = String(state.moves);
    dom.optimalCount.textContent = String(level.m);
    dom.bestCount.textContent = best ? String(best) : '—';
    dom.undoButton.disabled = race.active || state.won || state.history.length === 0 || state.busy;
    dom.redoButton.disabled = race.active || state.won || state.redo.length === 0 || state.busy;
    dom.restartButton.disabled = state.busy || Room.active;
    dom.hintButton.disabled = race.active || state.busy || state.won;
    dom.soundButton.setAttribute('aria-pressed', String(state.sound));
    dom.soundIcon.textContent = state.sound ? '♪' : '⌁';
    dom.soundLabel.textContent = state.sound ? 'Som ligado' : 'Som desligado';
    document.body.classList.toggle('reduced-motion', state.reducedMotion);

    if (state.hint) {
      const hintPiece = state.pieces[state.hint.piece];
      setTip('Dica pronta', `Mova ${pieceName(state.hint.piece, hintPiece)} ${directionName(hintPiece, state.hint.to > state.hint.from ? 1 : -1)}.`);
    } else if (state.moves === 0) {
      setTip('Uma pista rápida', 'Cada movimento pode deslizar um veículo por várias casas.');
    } else if (state.moves <= level.m) {
      setTip('Planeje a próxima jogada', 'Observe quem bloqueia a saída e abra espaço antes de mover o vermelho.');
    } else {
      setTip('Continue procurando', 'Desfazer é parte do jogo. Tente abrir o caminho por outro lado.');
    }
    updateRaceUI();
  }

  function calculateStars(moves, optimal) {
    if (moves <= optimal) return 3;
    if (moves <= Math.ceil(optimal * 1.25) + 1) return 2;
    return 1;
  }

  function handleWin() {
    if (state.won) return;
    state.won = true;
    if (race.active) { finishRaceStage(); return; }
    $('shareResultButton').hidden = true;
    $('winTitle').textContent = 'Boa! Você saiu do congestionamento.';
    dom.winReplayButton.textContent = 'Jogar de novo';
    const levelProgress = state.progress.levels[state.current] || {};
    const isNewBest = !levelProgress.bestMoves || state.moves < levelProgress.bestMoves;
    const stars = Math.min(calculateStars(state.moves, currentLevel().m), state.hintsUsed ? 2 : 3);
    state.progress.levels[state.current] = {
      solved: true,
      bestMoves: isNewBest ? state.moves : levelProgress.bestMoves,
      stars: Math.max(stars, levelProgress.stars || 0),
    };
    state.progress.unlocked = Math.max(state.progress.unlocked, Math.min(LEVELS.length, state.current + 2));
    saveProgress();
    updateHud();
    const hero = state.elements[Engine.HERO];
    if (hero) hero.classList.add('is-escaping');
    playTone('win');
    announce(`Fase concluída em ${state.moves} movimentos.`);
    if (isNewBest) {
      dom.winNote.textContent = state.moves <= currentLevel().m ? 'Novo recorde: você alcançou o melhor conhecido para esta fase.' : 'Novo recorde pessoal. A próxima rota está liberada.';
    } else {
      dom.winNote.textContent = state.hintsUsed ? `Você usou ${state.hintsUsed} ${state.hintsUsed === 1 ? 'dica' : 'dicas'} — vale tentar de novo sem pressa.` : 'A próxima rota está liberada. Será que dá para economizar um movimento?';
    }
    if (state.hintsUsed) dom.winNote.textContent = `${state.hintsUsed} dica(s) usada(s). Para ganhar ouro, resolva sem dicas.`;
    dom.winScore.textContent = `Resolvido em ${state.moves} ${state.moves === 1 ? 'movimento' : 'movimentos'} · melhor possível: ${currentLevel().m}.`;
    dom.winStars.textContent = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
    dom.winStars.className = `stars ${stars === 1 ? 'one-star' : stars === 2 ? 'two-stars' : ''}`;
    dom.winStars.setAttribute('aria-label', `${stars} ${stars === 1 ? 'estrela' : 'estrelas'}`);
    dom.nextLevelButton.innerHTML = state.current < LEVELS.length - 1 ? 'Próxima fase <span aria-hidden="true">→</span>' : 'Jogar novamente <span aria-hidden="true">↻</span>';
    scheduleWin();
  }

  function requestHint() {
    if (race.active || state.busy || state.won) return;
    if (state.hint) {
      showToast('A dica já está acesa no tabuleiro.');
      return;
    }
    state.busy = true;
    dom.hintButton.disabled = true;
    setTip('Procurando uma dica…', 'Vou calcular o próximo movimento mais eficiente.');
    announce('Procurando a melhor próxima jogada.');
    const generation = state.generation;
    window.setTimeout(() => {
      if (generation !== state.generation) return;
      try {
        const result = Engine.solve(state.pieces, { maxStates: 900000 });
        if (result && result.solution && result.solution.length) {
          state.hint = result.solution[0];
          state.hintsUsed += 1;
          renderPieces(false);
          updateHud();
          const piece = state.pieces[state.hint.piece];
          showToast(`Dica: mova ${pieceName(state.hint.piece, piece)} ${directionName(piece, state.hint.to > state.hint.from ? 1 : -1)}.`);
          announce(`Dica: mova ${pieceName(state.hint.piece, piece)} ${directionName(piece, state.hint.to > state.hint.from ? 1 : -1)}.`);
        } else {
          setTip('Sem dica agora', 'Reinicie a fase e tente uma nova rota.');
          showToast('Não encontrei uma rota a partir desta posição.');
        }
      } catch (error) {
        setTip('Tente mais uma vez', 'O cálculo demorou mais do que o esperado.');
        showToast('A dica não ficou pronta.');
      } finally {
        state.busy = false;
        updateHud();
      }
    }, 35);
  }

  function renderLevels() {
    dom.levelsList.replaceChildren();
    let offset = 0;
    TIERS.forEach((tier) => {
      const group = document.createElement('section');
      group.className = 'level-group';
      const heading = document.createElement('div');
      heading.className = 'level-group-heading';
      const name = document.createElement('span');
      name.textContent = tier.nome;
      const range = document.createElement('small');
      range.textContent = `${offset + 1}–${offset + Number(tier.levels)}`;
      heading.append(name, range);
      const grid = document.createElement('div');
      grid.className = 'level-grid';
      for (let local = 0; local < Number(tier.levels); local += 1) {
        const index = offset + local;
        const level = LEVELS[index];
        if (!level) continue;
        const button = document.createElement('button');
        const levelProgress = state.progress.levels[index];
        button.type = 'button';
        button.className = 'level-button';
        if (index === state.current) button.classList.add('is-current');
        if (levelProgress && levelProgress.solved) button.classList.add('is-complete');
        button.disabled = index >= state.progress.unlocked;
        button.dataset.level = String(index);
        button.setAttribute('aria-label', `Fase ${index + 1}, ${level.m} movimentos mínimos${button.disabled ? ', bloqueada' : ''}`);
        const number = document.createElement('span');
        number.textContent = String(index + 1);
        button.appendChild(number);
        const best = document.createElement('small');
        best.className = 'level-best';
        best.textContent = levelProgress && levelProgress.bestMoves ? `${'★'.repeat(levelProgress.stars)} · ${levelProgress.bestMoves}` : `${level.m} mov.`;
        button.appendChild(best);
        grid.appendChild(button);
      }
      group.append(heading, grid);
      dom.levelsList.appendChild(group);
      offset += Number(tier.levels);
    });
  }

  function openModal(modal, focusTarget) {
    [dom.levelModal, dom.helpModal, dom.winModal].forEach((other) => { if (other !== modal) other.hidden = true; });
    state.focusReturn = document.activeElement;
    modal.hidden = false;
    document.querySelector('.app-shell').inert = true;
    document.body.classList.add('modal-open');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function closeModal(modal) {
    if (!modal) return;
    const wasOpen = !modal.hidden;
    modal.hidden = true;
    if (dom.levelModal.hidden && dom.helpModal.hidden && dom.winModal.hidden) {
      document.body.classList.remove('modal-open');
      document.querySelector('.app-shell').inert = false;
      if (wasOpen && state.focusReturn?.isConnected) state.focusReturn.focus({ preventScroll: true });
    }
  }

  function toggleLevels() {
    if (race.active) return;
    if (!dom.levelModal.hidden) {
      closeModal(dom.levelModal);
      return;
    }
    renderLevels();
    openModal(dom.levelModal, dom.closeLevelModal);
  }

  function toggleHelp() {
    if (!dom.helpModal.hidden) {
      closeModal(dom.helpModal);
      return;
    }
    openModal(dom.helpModal, dom.closeHelpModal);
  }

  function toggleSound() {
    state.sound = !state.sound;
    saveProgress();
    updateHud();
    if (state.sound) {
      playTone('move');
      showToast('Som ligado.');
    } else {
      showToast('Som desligado.');
    }
  }

  function playTone(kind) {
    if (!state.sound || !window.AudioContext) return;
    try {
      if (!state.audioContext) state.audioContext = new window.AudioContext();
      const context = state.audioContext;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      const config = kind === 'win' ? { start: 440, end: 760, duration: 0.32 } : kind === 'blocked' ? { start: 100, end: 78, duration: 0.08 } : { start: 220, end: 280, duration: 0.08 };
      oscillator.type = kind === 'win' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(config.start, now);
      oscillator.frequency.exponentialRampToValueAtTime(config.end, now + config.duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.08 : 0.035, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + config.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + config.duration + 0.02);
    } catch (error) {
      // Sound is a bonus; a browser without Web Audio should not affect play.
    }
  }

  function onGlobalKeyDown(event) {
    const modal = [dom.winModal, dom.levelModal, dom.helpModal].find((item) => !item.hidden);
    if (modal && event.key === 'Tab') {
      const items = [...modal.querySelectorAll('button:not(:disabled), input, a[href]')].filter(el => !el.hidden);
      if (items.length && event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (items.length && !event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      return;
    }
    if (event.target.matches('input, textarea, [contenteditable="true"]')) return;
    if (modal && event.key !== 'Escape') return;
    if (event.key === 'Escape') {
      if (!dom.winModal.hidden) closeModal(dom.winModal);
      else if (!dom.levelModal.hidden) closeModal(dom.levelModal);
      else if (!dom.helpModal.hidden) closeModal(dom.helpModal);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    }
  }

  function bindEvents() {
    dom.undoButton.addEventListener('click', undo);
    dom.redoButton.addEventListener('click', redo);
    dom.restartButton.addEventListener('click', () => restart(true));
    dom.hintButton.addEventListener('click', requestHint);
    dom.levelMenuButton.addEventListener('click', toggleLevels);
    dom.helpButton.addEventListener('click', toggleHelp);
    dom.soundButton.addEventListener('click', toggleSound);
    dom.closeLevelModal.addEventListener('click', () => closeModal(dom.levelModal));
    dom.closeHelpModal.addEventListener('click', () => closeModal(dom.helpModal));
    dom.closeHelpAction.addEventListener('click', () => closeModal(dom.helpModal));
    dom.levelModal.addEventListener('click', (event) => {
      if (event.target === dom.levelModal) closeModal(dom.levelModal);
      const button = event.target.closest('.level-button');
      if (button && !button.disabled) loadLevel(Number(button.dataset.level));
    });
    dom.helpModal.addEventListener('click', (event) => {
      if (event.target === dom.helpModal) closeModal(dom.helpModal);
    });
    dom.winReplayButton.addEventListener('click', () => restart(true));
    dom.nextLevelButton.addEventListener('click', () => {
      if (race.active) {
        advanceRace();
        return;
      }
      if (state.current < LEVELS.length - 1) loadLevel(state.current + 1);
      else loadLevel(0);
    });
    document.addEventListener('keydown', onGlobalKeyDown);
    dom.board.addEventListener('pointerdown', () => dom.board.focus({ preventScroll: true }), { capture: true });
    window.addEventListener('resize', () => {
      if (state.drag) {
        state.drag = null;
        renderPieces(false);
      }
    });
    document.querySelector('.brand').addEventListener('click', (event) => {
      event.preventDefault();
      if (race.active) enterRace(race.date);
      else loadLevel(state.current);
    });
    $('campaignMode').addEventListener('click', enterCampaign);
    $('dailyMode').addEventListener('click', () => enterRace(Competition.today()));
    $('startRaceButton').addEventListener('click', startRace);
    $('continueRaceButton').addEventListener('click', advanceRace);

    $('shareResultButton').addEventListener('click', () => shareRace(true));
    $('shareBestButton').addEventListener('click', () => shareRace(true));
    $('nickname').value = raceStore.name;
    $('nickname').addEventListener('change', () => {
      raceStore.name = Competition.nickname($('nickname').value);
      $('nickname').value = raceStore.name;
      saveRaceStore();
    });
    $('copyShareButton').addEventListener('click', copyShareLink);
    window.addEventListener('hashchange', readChallenge);
    setInterval(() => {
      if (race.active && ['playing','between'].includes(race.status)) $('raceClock').textContent = Competition.formatTime(Room.active ? Room.elapsed() : race.elapsed + (race.status === 'playing' ? performance.now() - race.started : 0));
    }, 250);
  }


  function scheduleWin() {
    clearTimeout(state.winTimer);
    const generation = state.generation;
    state.winTimer = window.setTimeout(() => {
      if (state.won && generation === state.generation) openModal(dom.winModal, dom.nextLevelButton);
    }, state.reducedMotion ? 0 : 420);
  }

  function readRaceStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem('sai-da-frente-racha-v1'));
      if (!parsed || typeof parsed !== 'object') throw new Error();
      const records = {};
      Object.entries(parsed.records || {}).slice(-120).forEach(([date, result]) => {
        try { if (date === result.d) records[date] = Competition.verify(result, LEVELS, Engine); } catch (_) { /* Ignore corrupt records. */ }
      });
      return { name: Competition.nickname(parsed.name), records };
    } catch (_) { return { name: 'Piloto', records: {} }; }
  }
  function saveRaceStore() {
    try { localStorage.setItem('sai-da-frente-racha-v1', JSON.stringify(raceStore)); }
    catch (_) { showToast('Não foi possível salvar neste navegador. Compartilhe o link para guardar seu resultado.'); }
  }
  function enterCampaign() {
    if (Room.active) { showToast('Use Sair da sala para voltar à campanha.'); return; }
    race.active = false;
    race.status = 'ready';
    history.replaceState(null, '', location.pathname + location.search);
    $('shareBox').hidden = true;
    loadLevel(state.progress.current);
  }
  function enterRace(date) {
    if (Room.active && race.active) return;
    clearTimeout(state.winTimer);
    state.generation++;
    state.busy = false;
    state.drag = null;
    race.active = true;
    race.date = date;
    race.status = 'ready';
    race.stage = 0;
    race.totalMoves = 0;
    race.elapsed = 0;
    race.traces = [];
    race.result = null;
    if (race.imported?.d !== date) race.imported = null;
    const params = new URLSearchParams({ v: '1', racha: date });
    if (race.imported) params.set('r', Competition.encode(race.imported));
    if (!Room.active) history.replaceState(null, '', location.pathname + location.search + '#' + params.toString());
    [dom.winModal, dom.levelModal, dom.helpModal].forEach(closeModal);
    $('shareBox').hidden = true;
    updateRaceUI();
  }
  function startRace() {
    if (Room.active) return;
    if (!race.active || !['ready', 'finished'].includes(race.status)) return;
    raceStore.name = Competition.nickname($('nickname').value);
    $('nickname').value = raceStore.name;
    race.stage = 0; race.totalMoves = 0; race.elapsed = 0; race.traces = []; race.result = null;
    $('shareBox').hidden = true;
    startRaceStage();
  }
  function startRaceStage() {
    race.status = 'playing';
    race.started = performance.now();
    loadLevel(Competition.stages(race.date)[race.stage]);
    state.elements[0]?.focus({ preventScroll: true });
    if (window.innerWidth <= 780) document.querySelector('.level-heading').scrollIntoView({ block: 'start' });
    saveRoomCheckpoint();
  }
  function advanceRace() {
    if (Room.active && Room.paused) {
      showToast('A partida está pausada pelo anfitrião. Aguarde a retomada.');
      return;
    }
    closeModal(dom.winModal);
    if (race.status === 'between') { race.stage++; startRaceStage(); }
    else if (race.status === 'finished' && !Room.active) { enterRace(race.date); startRace(); }
  }
  function finishRaceStage() {
    if (Room.active) race.elapsed = Room.elapsed();
    else race.elapsed += Math.max(0, performance.now() - race.started);
    race.totalMoves += state.moves;
    race.traces.push(state.history.map(move => move.piece.toString(36) + move.to.toString(36)).join(''));
    const finished = race.stage === 2;
    race.status = finished ? 'finished' : 'between';
    if (finished) {
      race.result = Competition.verify({ v: 1, d: race.date, n: raceStore.name,
        m: race.totalMoves, t: Math.round(race.elapsed / 1000) * 1000, p: race.traces }, LEVELS, Engine);
      const best = raceStore.records[race.date];
      if (Room.active) Room.finish(race.result);
      else {
        if (!best || Competition.compare(race.result, best) < 0) raceStore.records[race.date] = race.result;
        saveRaceStore();
      }
    }
    updateHud();
    const optimal = Competition.stages(race.date).reduce((sum, index) => sum + LEVELS[index].m, 0);
    $('winTitle').textContent = finished ? 'Racha fechado. Sua vez de desafiar!' : `Etapa ${race.stage + 1} concluída!`;
    dom.winScore.textContent = finished ? `${race.totalMoves} movimentos · ${Competition.formatTime(race.elapsed)} · ideal: ${optimal}` : `${state.moves} movimentos nesta etapa · ${race.totalMoves} no total.`;
    dom.winStars.textContent = finished ? (race.totalMoves === optimal ? '★★★' : race.totalMoves <= Math.ceil(optimal * 1.25) ? '★★☆' : '★☆☆') : `${race.stage + 1} / 3`;
    dom.winStars.className = 'stars';
    dom.winStars.setAttribute('aria-label', finished ? Competition.medal(race.totalMoves, optimal) : `${race.stage + 1} de 3 etapas`);
    dom.winNote.textContent = finished ? Competition.medal(race.totalMoves, optimal) + '. Envie o resultado para um amigo bater sua marca.' : 'O relógio está pausado. A próxima etapa começa quando você estiver pronto.';
    dom.nextLevelButton.textContent = finished ? 'Tentar de novo' : 'Próxima etapa →';
    dom.winReplayButton.textContent = 'Voltar ao racha';
    $('shareResultButton').hidden = !finished || Room.active;
    if (Room.active) {
      $('winTitle').textContent = finished ? 'Você terminou o racha!' : `Etapa ${race.stage + 1} concluída!`;
      dom.winNote.textContent = finished ? 'Seu resultado será confirmado no placar da sala. Aguarde seus amigos terminarem.' : 'O tempo da sala continua correndo. Avance para a próxima etapa!';
      dom.nextLevelButton.textContent = finished ? 'Ver placar da sala' : 'Próxima etapa →';
      dom.winReplayButton.textContent = 'Ver sala';
    }
    saveRoomCheckpoint();
    state.elements[0]?.classList.add('is-escaping');
    playTone('win');
    announce(dom.winScore.textContent);
    scheduleWin();
  }
  function updateRaceUI() {
    const roomPaused = Room.active && Room.paused;
    document.body.classList.toggle('room-paused', roomPaused);
    dom.board.classList.toggle('is-paused', roomPaused);
    dom.board.setAttribute('aria-disabled', String(roomPaused));
    $('racePauseLabel').hidden = !roomPaused;
    $('campaignMode').setAttribute('aria-pressed', String(!race.active));
    $('dailyMode').setAttribute('aria-pressed', String(race.active));
    $('racePanel').hidden = !race.active;
    $('gameMain').hidden = race.active && ['ready', 'finished'].includes(race.status);
    dom.levelMenuButton.disabled = race.active;
    const stars = Object.values(state.progress.levels).reduce((sum, item) => sum + item.stars, 0);
    const title = stars >= 180 ? 'Lenda das ruas' : stars >= 100 ? 'Piloto de elite' : stars >= 40 ? 'Dono da pista' : 'Aprendiz';
    $('careerBadge').textContent = `${title} · ${stars} / 216 ★`;
    if (!race.active) return;
    const inRound = ['playing', 'between'].includes(race.status);
    $('raceLobby').hidden = inRound || Room.active;
    $('raceLive').hidden = !inRound;
    $('continueRaceButton').hidden = race.status !== 'between';
    $('continueRaceButton').disabled = roomPaused;
    $('raceDate').textContent = race.date.split('-').reverse().join('/');
    $('raceLabel').textContent = race.date === Competition.today() ? 'RACHA DO DIA' : 'RACHA POR CONVITE';
    $('raceClock').textContent = Competition.formatTime(Room.active ? Room.elapsed() : race.elapsed + (race.status === 'playing' ? performance.now() - race.started : 0));
    $('raceTotal').textContent = `${race.totalMoves + (race.status === 'playing' ? state.moves : 0)} mov.`;
    $('raceStep').textContent = `Etapa ${race.stage + 1} de 3`;
    $('streakBadge').textContent = `${Competition.streak(Object.keys(raceStore.records), Competition.today())} dia(s) de sequência`;
    if (inRound) {
      dom.tierName.textContent = ['AQUECIMENTO', 'TRÂNSITO PESADO', 'HORA DO RUSH'][race.stage];
      dom.levelTitle.textContent = `Etapa ${race.stage + 1} de 3`;
      dom.levelNumber.textContent = formatNumber(race.stage + 1);
      dom.levelDescription.textContent = 'Cada jogada conta. Abra caminho com estratégia.';
      dom.progressCount.textContent = `${race.stage + (state.won ? 1 : 0)} / 3`;
      dom.progressTier.textContent = 'Racha entre amigos';
      dom.tierChip.textContent = 'SEM AJUDAS';
      dom.progressBar.style.width = `${(race.stage + (state.won ? 1 : 0)) / 3 * 100}%`;
      dom.progressCaption.textContent = '3 etapas · menos movimentos vence · tempo desempata';
      dom.bestCount.textContent = '—';
      setTip('Vale cada movimento', Room.active ? (roomPaused ? 'A partida está pausada pelo anfitrião. Nenhum movimento ou segundo é contado até retomar.' : 'Sem dicas, desfazer ou reiniciar. O tempo corre até terminar as três etapas.') : 'Sem dicas e sem desfazer. Reiniciar começa outra tentativa inteira.');
    }
    renderComparison();
  }
  function renderComparison() {
    const best = raceStore.records[race.date];
    const incoming = race.imported;
    const items = [];
    if (best) items.push({ result: best, label: `${best.n} · seu recorde` });
    if (incoming) items.push({ result: incoming, label: `${incoming.n} · convite` });
    if (race.result && best && Competition.compare(race.result, best) !== 0) items.push({ result: race.result, label: `${race.result.n} · agora` });
    items.sort((a, b) => Competition.compare(a.result, b.result));
    $('comparison').replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'empty-score';
      empty.textContent = 'A primeira marca pode ser sua. Termine o racha e mande o link no grupo.';
      $('comparison').append(empty);
    }
    let rank = 1;
    items.forEach((item, index) => {
      if (index && Competition.compare(item.result, items[index - 1].result) !== 0) rank = index + 1;
      const tied = items.some((other) => other !== item && Competition.compare(other.result, item.result) === 0);
      const row = document.createElement('div'); row.className = 'score-row';
      const label = document.createElement('span'); label.textContent = `${rank}. ${item.label}${tied ? ' · empate' : ''}`;
      const score = document.createElement('strong'); score.textContent = `${item.result.m} mov. · ${Competition.formatTime(item.result.t)}`;
      row.append(label, score); $('comparison').append(row);
    });
    $('shareBestButton').hidden = !best && !race.result;
    $('startRaceButton').textContent = best ? 'Tentar bater meu recorde →' : 'Começar racha →';
  }
  function readChallenge() {
    if (!location.hash) { if (race.active) enterCampaign(); return; }
    try {
      const hash = location.hash.slice(1);
      if (hash.length > 4200) throw new Error();
      const params = new URLSearchParams(hash);
      if (params.has('sala')) {
        const inviteHash = location.hash;
        enterRace(Competition.today());
        if (!Room.active) {
          history.replaceState(null, '', location.pathname + location.search + inviteHash);
          $('roomCodeInput').value = params.get('sala');
          $('roomJoinError').textContent = 'Escolha seu apelido e clique em Entrar na sala.';
        }
        return;
      }
      if (Room.active) return;
      const date = params.get('racha');
      if (!Competition.validDate(date) || date > Competition.today() || params.get('v') !== '1') throw new Error();
      const token = params.get('r');
      const result = token ? Competition.verify(Competition.decode(token), LEVELS, Engine) : null;
      if (result && result.d !== date) throw new Error();
      race.imported = result;
      enterRace(date);
      if (result) showToast(`Desafio de ${result.n}: ${result.m} movimentos. Você consegue bater?`);
    } catch (_) {
      showToast('Este link de desafio está inválido ou é de outra versão. Peça um novo convite.');
      enterRace(Competition.today());
    }
  }
  async function shareRace(withResult) {
    const result = race.result || raceStore.records[race.date];
    const url = new URL(location.href);
    url.search = '';
    const params = new URLSearchParams({ v: '1', racha: race.date });
    if (withResult && result) params.set('r', Competition.encode(result));
    url.hash = params.toString();
    $('shareLink').value = url.href;
    $('shareBox').hidden = false;
    closeModal(dom.winModal);
    $('shareBox').scrollIntoView({ behavior: state.reducedMotion ? 'instant' : 'smooth', block: 'nearest' });
    await copyShareLink();
  }
  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText($('shareLink').value);
      $('shareStatus').textContent = 'Link copiado! Cole no grupo ou envie para um amigo.';
      showToast('Link copiado. Hora de desafiar seus amigos!');
    } catch (_) {
      $('shareStatus').textContent = 'Selecione e copie o link abaixo para enviar aos amigos.';
      $('shareLink').focus(); $('shareLink').select();
    }
  }


  function saveRoomCheckpoint() {
    if (!Room.active || !Room.state || !['playing','between','finished'].includes(race.status)) return;
    Room.save({ startsAt: Room.state.room.startsAt, day: race.date, stage: race.stage,
      status: race.status, traces: race.traces,
      trace: state.history.map(m => m.piece.toString(36) + m.to.toString(36)).join('') });
  }
  function startRoomRace(snapshot, checkpoint) {
    race.active = true; race.date = snapshot.room.day; race.stage = 0;
    race.totalMoves = 0; race.elapsed = 0; race.traces = []; race.result = null;
    raceStore.name = snapshot.players.find(p => p.id === snapshot.selfId)?.name || raceStore.name;
    const replay = (index, trace) => {
      if (typeof trace !== 'string' || trace.length > Competition.MAX_MOVES * 2 || trace.length % 2 || !/^[0-9a-z]*$/.test(trace)) throw new Error();
      const pieces = Engine.parseBoard(LEVELS[index].b), history = [];
      for (let i = 0; i < trace.length; i += 2) {
        const piece = parseInt(trace[i],36), to = parseInt(trace[i+1],36), world = Engine.createWorld(pieces);
        if (world.solved(world.start)) throw new Error();
        const buf = new Int32Array(pieces.length * 12), n = world.moves(world.start,buf);
        let legal = false; for(let j=0;j<n;j+=2) if(buf[j]===piece && buf[j+1]===to) legal=true;
        if(!legal) throw new Error();
        history.push({piece,from:pieces[piece].pos,to}); pieces[piece].pos=to;
      }
      const w = Engine.createWorld(pieces);
      return { pieces, history, solved:w.solved(w.start) };
    };
    try {
      if (!checkpoint) { startRaceStage(); return; }
      const cp=checkpoint, indices=Competition.stages(race.date);
      if(cp.startsAt!==snapshot.room.startsAt || cp.day!==race.date || !Number.isInteger(cp.stage) || cp.stage<0 || cp.stage>2 || !['playing','between'].includes(cp.status)) throw new Error();
      if(!Array.isArray(cp.traces) || cp.traces.length!==cp.stage+(cp.status==='between'?1:0)) throw new Error();
      cp.traces.forEach((trace,i)=>{if(!replay(indices[i],trace).solved)throw new Error();});
      const current=replay(indices[cp.stage],cp.trace);
      if(current.solved!==(cp.status==='between'))throw new Error();
      race.stage=cp.stage;race.status=cp.status;race.started=performance.now();race.traces=cp.traces;
      race.totalMoves=cp.traces.reduce((n,t)=>n+t.length/2,0);
      loadLevel(indices[cp.stage]);
      state.pieces=current.pieces;state.history=current.history;state.moves=current.history.length;state.won=current.solved;
      renderPieces(false);updateHud();
      showToast(Room.paused ? 'Você voltou à partida pausada. Aguarde a retomada.' : 'Você voltou à partida. O relógio continuou correndo.');
    } catch (_) {
      race.stage=0;race.totalMoves=0;race.traces=[];startRaceStage();
      showToast('Não foi possível recuperar as jogadas. A tentativa voltou ao início com o tempo original.');
    }
  }

  function start() {
    if (!Engine || !LEVELS.length) {
      setTip('Não foi possível abrir', 'Os dados das fases não foram carregados.');
      return;
    }
    bindEvents();
    loadLevel(state.progress.current || 0);
    readChallenge();
    Room.attach({ start: startRoomRace, stage: () => race.stage, change: () => {
      if (Room.active && !race.active) enterRace(Room.state?.room.day || Competition.today());
      if (Room.state) race.date = Room.state.room.day;
      if (Room.paused && state.drag) { state.drag = null; renderPieces(false); }
      updateRaceUI();
    }, leave: () => { race.active = false; enterRace(Competition.today()); } });
  }

  start();
})();
