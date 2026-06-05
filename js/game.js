// ============================================================
// WORDLE GAME — Main Logic
// ============================================================

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScrQOgBeGKO_KCit6xhfxfAwOmsSygyTP7P69mK47sA-bH60g/viewform?usp=dialog';

// ─── Strategy tips (shown ~20% of time on failed words) ───
const TIPS = [
  "Try starting with CRANE, SLATE, or AUDIO — they cover common letters fast.",
  "Yellow tiles tell you the letter is in the word — just not there. Move it!",
  "If you're stuck, burn a guess to test 5 completely new letters.",
  "Common endings: -TION, -IGHT, -OUND, -ATCH. Worth remembering.",
  "Double letters trip people up. If you've placed all 5 letters and it's wrong, try doubling one.",
  "Think about what letters you haven't tried yet before your next guess.",
  "STORM, PLANK, and DYING together cover 15 different letters — great for a 3-guess opener.",
  "Grey is useful too — it rules out letters and narrows the field fast.",
  "Sometimes the hardest words have simple, common letters in uncommon orders.",
  "On theme days, think about what words fit the category — proper nouns count!",
];

let state = {
  todayKey: '',
  theme: null,
  words: [],
  currentWordIndex: 0,
  currentGuess: '',
  guesses: [],
  allResults: [],
  gameOver: false,
  wordsData: null,
  wordComplete: false,
};

// ─── Stats (localStorage) ─────────────────────────────────
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem('wordleStats')) || {
      totalGames: 0,
      totalWins: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastPlayedDate: null,
      guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 },
    };
  } catch {
    return { totalGames: 0, totalWins: 0, currentStreak: 0, longestStreak: 0, lastPlayedDate: null, guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 } };
  }
}

function saveStats(stats) {
  localStorage.setItem('wordleStats', JSON.stringify(stats));
}

function loadDayProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('wordleDayProgress'));
    if (saved && saved.dateKey === state.todayKey) return saved;
  } catch {}
  return null;
}

function saveDayProgress() {
  localStorage.setItem('wordleDayProgress', JSON.stringify({
    dateKey: state.todayKey,
    currentWordIndex: state.currentWordIndex,
    allResults: state.allResults,
    gameOver: state.gameOver,
  }));
}

// ─── Date helpers ─────────────────────────────────────────
function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPrevDateKey(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Load words for today ──────────────────────────────────
async function loadWords() {
  try {
    const res = await fetch('words.json?v=' + Date.now());
    state.wordsData = await res.json();
  } catch (e) {
    showError('Could not load word list. Please refresh.');
    return false;
  }

  state.todayKey = getTodayKey();
  const todayEntry = state.wordsData[state.todayKey];

  if (!todayEntry) {
    showError(`No words scheduled for today (${state.todayKey}). Add this date to words.json.`);
    return false;
  }

  state.words = todayEntry.words
    .map(w => w.toUpperCase().trim())
    .filter(w => w.length === WORD_LENGTH);

  if (state.words.length === 0) {
    showError('No valid 5-letter words found for today.');
    return false;
  }

  state.theme = todayEntry.theme || null;
  return true;
}

// ─── Evaluate a guess ─────────────────────────────────────
function evaluateGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill('absent');
  const answerArr = answer.split('');
  const guessArr = guess.split('');
  const used = Array(WORD_LENGTH).fill(false);

  guessArr.forEach((letter, i) => {
    if (letter === answerArr[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  });

  guessArr.forEach((letter, i) => {
    if (result[i] === 'correct') return;
    const foundIdx = answerArr.findIndex((l, j) => l === letter && !used[j]);
    if (foundIdx !== -1) {
      result[i] = 'present';
      used[foundIdx] = true;
    }
  });

  return result;
}

// ─── Keyboard tracking ────────────────────────────────────
let keyStates = {};

function updateKeyStates(guess, result) {
  guess.split('').forEach((letter, i) => {
    const current = keyStates[letter];
    const next = result[i];
    if (current === 'correct') return;
    if (current === 'present' && next !== 'correct') return;
    keyStates[letter] = next;
  });
  renderKeyboard();
}

function rebuildKeyStates() {
  keyStates = {};
  state.allResults.forEach(r => {
    r.guesses.forEach(g => {
      const res = evaluateGuess(g, r.word);
      updateKeyStates(g, res);
    });
  });
}

// ─── DOM helpers ───────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showError(msg) {
  const el = $('error-banner');
  if (!el) { alert(msg); return; }
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3500);
}

function showToast(msg, duration = 2000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), duration);
}

// ─── Render board ──────────────────────────────────────────
function renderBoard() {
  const board = $('board');
  board.innerHTML = '';

  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    row.id = `row-${r}`;

    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `tile-${r}-${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }

  state.guesses.forEach((g, r) => {
    const result = evaluateGuess(g, currentWord());
    fillRow(r, g, result, false);
  });

  if (!state.wordComplete) {
    fillCurrentInput();
  }
}

function currentWord() {
  return state.words[state.currentWordIndex];
}

function fillRow(rowIdx, guess, result, animate) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`tile-${rowIdx}-${c}`);
    tile.textContent = guess[c] || '';
    if (animate) {
      setTimeout(() => {
        tile.setAttribute('data-state', result[c]);
      }, c * 150);
    } else {
      tile.setAttribute('data-state', result[c]);
    }
  }
}

function fillCurrentInput() {
  const rowIdx = state.guesses.length;
  if (rowIdx >= MAX_GUESSES) return;
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`tile-${rowIdx}-${c}`);
    if (!tile) continue;
    tile.textContent = state.currentGuess[c] || '';
    tile.setAttribute('data-state', state.currentGuess[c] ? 'tbd' : '');
    if (c === state.currentGuess.length - 1 && state.currentGuess[c]) {
      tile.classList.add('pop');
      setTimeout(() => tile.classList.remove('pop'), 100);
    }
  }
}

// ─── Render keyboard ──────────────────────────────────────
function renderKeyboard() {
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','⌫'],
  ];

  const kb = $('keyboard');
  kb.innerHTML = '';

  rows.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'kb-row';
    row.forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'key';
      btn.textContent = key;
      btn.dataset.key = key;
      if (key === 'ENTER' || key === '⌫') btn.classList.add('key-wide');
      const st = keyStates[key];
      if (st) btn.setAttribute('data-state', st);
      btn.addEventListener('click', () => handleKey(key));
      rowEl.appendChild(btn);
    });
    kb.appendChild(rowEl);
  });
}

// ─── Handle input ─────────────────────────────────────────
function handleKey(key) {
  if (state.gameOver || state.wordComplete) return;

  if (key === '⌫' || key === 'Backspace') {
    state.currentGuess = state.currentGuess.slice(0, -1);
    fillCurrentInput();
    return;
  }

  if (key === 'ENTER' || key === 'Enter') {
    submitGuess();
    return;
  }

  if (/^[A-Za-z]$/.test(key) && state.currentGuess.length < WORD_LENGTH) {
    state.currentGuess += key.toUpperCase();
    fillCurrentInput();
  }
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  handleKey(e.key);
});

// ─── Submit guess ──────────────────────────────────────────
function submitGuess() {
  if (state.currentGuess.length < WORD_LENGTH) {
    shakeRow(state.guesses.length);
    showToast('Not enough letters');
    return;
  }

  const guess = state.currentGuess;
  const answer = currentWord();
  const result = evaluateGuess(guess, answer);
  const rowIdx = state.guesses.length;

  state.guesses.push(guess);
  state.currentGuess = '';

  fillRow(rowIdx, guess, result, true);
  updateKeyStates(guess, result);

  const won = result.every(r => r === 'correct');
  const lost = !won && state.guesses.length >= MAX_GUESSES;

  if (won || lost) {
    state.wordComplete = true;

    const wordResult = {
      word: answer,
      guesses: [...state.guesses],
      solved: won,
      guessCount: won ? state.guesses.length : null,
    };
    state.allResults.push(wordResult);

    const stats = loadStats();
    stats.totalGames++;
    if (won) {
      stats.totalWins++;
      stats.guessDistribution[state.guesses.length]++;
    } else {
      stats.guessDistribution['X']++;
    }
    saveStats(stats);

    const animDelay = WORD_LENGTH * 150 + 300;

    setTimeout(() => {
      if (won) {
        const messages = ['UNBELIEVABLE! 🎆','GENIUS! ✨','Impressive! ✨','👍 Nice work!','😅 Phew… made it!','😬 That was close!'];
        showToast(messages[state.guesses.length - 1] || 'Nice!', 1800);
      } else {
        showToast(`The word was ${answer}`, 2500);
      }

      setTimeout(() => showWordSummary(wordResult), won ? 1900 : 2600);
    }, animDelay);
  }

  saveDayProgress();
}

function shakeRow(rowIdx) {
  const row = $(`row-${rowIdx}`);
  row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 500);
}

// ─── Celebrations ─────────────────────────────────────────
function launchCelebration(guessCount, solved) {
  const modal = $('word-summary-modal');

  // Remove any old celebration elements
  modal.querySelectorAll('.celebration-text, #fireworks-canvas, .confetti-piece').forEach(el => el.remove());

  if (!solved) {
    // ~20% chance of showing a tip
    if (Math.random() < 0.2 && TIPS.length > 0) {
      const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
      const tipEl = document.createElement('div');
      tipEl.className = 'tip-box';
      tipEl.innerHTML = `<span class="tip-label">💡 Tip</span>${tip}`;
      modal.querySelector('.modal-box').insertBefore(tipEl, $('ws-next-btn'));
    }
    return;
  }

  const box = modal.querySelector('.modal-box');
  const celebEl = document.createElement('div');
  celebEl.className = `celebration-text celebration-${guessCount}`;

  if (guessCount === 1) {
    celebEl.textContent = 'UNBELIEVABLE! 🎆';
    launchFireworks();
  } else if (guessCount === 2) {
    celebEl.textContent = 'GENIUS! ✨';
    launchConfetti(box);
  } else if (guessCount === 3) {
    celebEl.textContent = 'Impressive! ✨';
    bounceCurrentTiles();
  } else if (guessCount === 4) {
    celebEl.textContent = '👍 Nice work!';
  } else if (guessCount === 5) {
    celebEl.textContent = '😅 Phew… made it!';
  } else {
    celebEl.textContent = '😬 That was close!';
  }

  box.insertBefore(celebEl, box.firstChild.nextSibling);
}

function launchFireworks() {
  const canvas = document.createElement('canvas');
  canvas.id = 'fireworks-canvas';
  document.body.appendChild(canvas);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ctx = canvas.getContext('2d');
  const particles = [];
  const colors = ['#4a7c59','#c9a84c','#e07c3a','#6b8cce','#c9507c'];

  for (let i = 0; i < 120; i++) {
    const angle = (Math.PI * 2 * i) / 120;
    const speed = 3 + Math.random() * 5;
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      alpha: 1,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 4,
    });
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.alpha -= 0.018;
      ctx.globalAlpha = Math.max(p.alpha, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    frame++;
    if (frame < 120) requestAnimationFrame(draw);
    else canvas.remove();
  }
  requestAnimationFrame(draw);

  canvas.addEventListener('click', () => canvas.remove());
  setTimeout(() => canvas.remove(), 3500);
}

function launchConfetti(container) {
  const colors = ['#4a7c59','#c9a84c','#e07c3a','#6b8cce','#c9507c','#f0e68c'];
  for (let i = 0; i < 36; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-delay: ${Math.random() * 0.6}s;
      animation-duration: ${0.9 + Math.random() * 0.6}s;
      width: ${6 + Math.random() * 6}px;
      height: ${6 + Math.random() * 6}px;
      transform: rotate(${Math.random() * 360}deg);
    `;
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 2000);
  }
}

function bounceCurrentTiles() {
  const rowIdx = state.guesses.length - 1;
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`tile-${rowIdx}-${c}`);
    if (tile) {
      setTimeout(() => {
        tile.classList.add('celebrate-bounce');
        setTimeout(() => tile.classList.remove('celebrate-bounce'), 600);
      }, c * 100);
    }
  }
}

// ─── Between-word summary modal ───────────────────────────
function showWordSummary(result) {
  const isLast = state.currentWordIndex >= state.words.length - 1;
  const box = $('word-summary-modal').querySelector('.modal-box');

  // Clear any old celebration/tip elements
  box.querySelectorAll('.celebration-text, .tip-box').forEach(el => el.remove());

  $('ws-word').textContent = result.word;
  $('ws-result').textContent = result.solved
    ? `Solved in ${result.guessCount} ${result.guessCount === 1 ? 'guess' : 'guesses'}!`
    : 'Not solved this time.';

  const miniGrid = $('ws-mini-grid');
  miniGrid.innerHTML = '';
  result.guesses.forEach(guess => {
    const rowEl = document.createElement('div');
    rowEl.className = 'mini-row';
    const res = evaluateGuess(guess, result.word);
    guess.split('').forEach((letter, i) => {
      const tile = document.createElement('div');
      tile.className = 'mini-tile';
      tile.setAttribute('data-state', res[i]);
      tile.textContent = letter;
      rowEl.appendChild(tile);
    });
    miniGrid.appendChild(rowEl);
  });

  const nextBtn = $('ws-next-btn');
  nextBtn.textContent = isLast
    ? 'See Final Summary'
    : `Next Word (${state.currentWordIndex + 2} of ${state.words.length})`;

  $('word-summary-modal').classList.add('visible');

  // Launch celebration after modal is visible
  launchCelebration(result.guessCount, result.solved);
}

$('ws-next-btn').addEventListener('click', () => {
  $('word-summary-modal').classList.remove('visible');
  const isLast = state.currentWordIndex >= state.words.length - 1;
  if (isLast) {
    showFinalSummary();
  } else {
    advanceToNextWord();
  }
});

// ─── Advance to next word ──────────────────────────────────
function advanceToNextWord() {
  state.currentWordIndex++;
  state.guesses = [];
  state.currentGuess = '';
  state.gameOver = false;
  state.wordComplete = false;
  keyStates = {};
  rebuildKeyStates();
  updateWordCounter();
  renderBoard();
  renderKeyboard();
  saveDayProgress();
}

// ─── Final summary ─────────────────────────────────────────
function showFinalSummary() {
  state.gameOver = true;

  const stats = loadStats();
  const today = state.todayKey;
  const yesterday = getPrevDateKey(today);

  if (stats.lastPlayedDate === yesterday) {
    stats.currentStreak++;
  } else if (stats.lastPlayedDate !== today) {
    stats.currentStreak = 1;
  }
  stats.longestStreak = Math.max(stats.longestStreak, stats.currentStreak);
  stats.lastPlayedDate = today;
  saveStats(stats);

  const solved = state.allResults.filter(r => r.solved).length;
  const total = state.allResults.length;

  $('fs-score').textContent = `${solved} / ${total} solved`;
  $('fs-streak').textContent = `🔥 Current streak: ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`;
  $('fs-longest').textContent = `Best streak: ${stats.longestStreak} days`;

  const grid = $('fs-grid');
  grid.innerHTML = '';
  state.allResults.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'fs-row';
    const label = document.createElement('span');
    label.className = 'fs-label';
    label.textContent = `${i + 1}. ${r.word}`;
    const badge = document.createElement('span');
    badge.className = 'fs-badge ' + (r.solved ? 'badge-win' : 'badge-loss');
    badge.textContent = r.solved ? `${r.guessCount}/6` : 'X/6';
    row.appendChild(label);
    row.appendChild(badge);
    grid.appendChild(row);
  });

  const shareText = buildShareText(solved, total);
  $('fs-share-text').value = shareText;

  $('final-summary-modal').classList.add('visible');
  saveDayProgress();
}

function buildShareText(solved, total) {
  const themeLabel = state.theme ? ` (${state.theme})` : '';
  let text = `Wordle${themeLabel} — ${state.todayKey}\n${solved}/${total} solved\n\n`;
  state.allResults.forEach(r => {
    r.guesses.forEach(guess => {
      const row = evaluateGuess(guess, r.word);
      text += row.map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛').join('') + '\n';
    });
    text += '\n';
  });
  return text.trim();
}

$('fs-copy-btn').addEventListener('click', () => {
  const text = $('fs-share-text').value;
  navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
});

$('fs-play-again').addEventListener('click', () => {
  $('final-summary-modal').classList.remove('visible');
  showToast("You've finished today's words! Come back tomorrow.", 3000);
});

// ─── Stats modal ───────────────────────────────────────────
$('stats-btn').addEventListener('click', () => {
  renderStatsModal();
  $('stats-modal').classList.add('visible');
});
$('stats-close').addEventListener('click', () => $('stats-modal').classList.remove('visible'));

function renderStatsModal() {
  const stats = loadStats();
  $('stat-games').textContent = stats.totalGames;
  $('stat-winpct').textContent = stats.totalGames > 0 ? Math.round(stats.totalWins / stats.totalGames * 100) : 0;
  $('stat-streak').textContent = stats.currentStreak;
  $('stat-longest').textContent = stats.longestStreak;

  const dist = $('guess-dist');
  dist.innerHTML = '';
  const max = Math.max(...Object.values(stats.guessDistribution), 1);
  [...Array(6).keys()].forEach(i => {
    const n = i + 1;
    const count = stats.guessDistribution[n] || 0;
    const row = document.createElement('div');
    row.className = 'dist-row';
    row.innerHTML = `<span class="dist-label">${n}</span><div class="dist-bar-wrap"><div class="dist-bar" style="width:${Math.max(count / max * 100, 4)}%">${count}</div></div>`;
    dist.appendChild(row);
  });
}

// ─── Help modal ─────────────────────────────────────────
$('help-btn').addEventListener('click', () => $('help-modal').classList.add('visible'));
$('help-close').addEventListener('click', () => $('help-modal').classList.remove('visible'));

// ─── Feedback button ────────────────────────────────────
$('feedback-btn').addEventListener('click', () => window.open(FEEDBACK_URL, '_blank'));

// Close modals on backdrop click
['stats-modal','help-modal'].forEach(id => {
  $(id).addEventListener('click', e => { if (e.target.id === id) $(id).classList.remove('visible'); });
});

// ─── Word counter ─────────────────────────────────────────
function updateWordCounter() {
  $('word-counter').textContent = `Word ${state.currentWordIndex + 1} of ${state.words.length}`;
}

// ─── Init ─────────────────────────────────────────────────
async function init() {
  const ok = await loadWords();
  if (!ok) return;

  const saved = loadDayProgress();
  if (saved) {
    state.currentWordIndex = saved.currentWordIndex;
    state.allResults = saved.allResults;
    state.gameOver = saved.gameOver;

    rebuildKeyStates();

    if (state.gameOver || state.currentWordIndex >= state.words.length) {
      showFinalSummary();
      return;
    }
  }

  if (state.theme) {
    const banner = $('theme-banner');
    banner.textContent = `🎯 Today's theme: ${state.theme}`;
    banner.style.display = 'block';
  }

  updateWordCounter();
  renderBoard();
  renderKeyboard();
}

init();
