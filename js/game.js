// ============================================================
// WORDLE GAME — Main Logic
// ============================================================

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const WORDS_PER_DAY = 10;

let state = {
  todayKey: '',
  theme: null,
  words: [],
  currentWordIndex: 0,
  currentGuess: '',
  guesses: [],        // guesses for current word
  allResults: [],     // results for all words today [{word, guesses, solved, guessCount}]
  gameOver: false,
  wordsData: null,
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
  } catch { return { totalGames: 0, totalWins: 0, currentStreak: 0, longestStreak: 0, lastPlayedDate: null, guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, X: 0 } }; }
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

  // Validate: all words must be 5 letters (skip bad entries with a warning)
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

  // First pass: correct positions
  guessArr.forEach((letter, i) => {
    if (letter === answerArr[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  });

  // Second pass: present but wrong position
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
let keyStates = {}; // letter -> 'correct' | 'present' | 'absent'

function updateKeyStates(guess, result) {
  guess.split('').forEach((letter, i) => {
    const current = keyStates[letter];
    const next = result[i];
    // Priority: correct > present > absent
    if (current === 'correct') return;
    if (current === 'present' && next !== 'correct') return;
    keyStates[letter] = next;
  });
  renderKeyboard();
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

  // Fill in previous guesses
  state.guesses.forEach((g, r) => {
    const result = evaluateGuess(g, currentWord());
    fillRow(r, g, result, false);
  });

  // Fill current typing row
  if (!state.gameOver) {
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
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`tile-${rowIdx}-${c}`);
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
  if (state.gameOver) return;

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
    const wordResult = {
      word: answer,
      guesses: [...state.guesses],
      solved: won,
      guessCount: won ? state.guesses.length : null,
    };
    state.allResults.push(wordResult);

    // Update stats
    const stats = loadStats();
    stats.totalGames++;
    if (won) {
      stats.totalWins++;
      stats.guessDistribution[state.guesses.length]++;
    } else {
      stats.guessDistribution['X']++;
    }
    saveStats(stats);

    setTimeout(() => {
      if (won) showToast(['Genius!','Magnificent!','Impressive!','Splendid!','Great!','Phew!'][state.guesses.length - 1] || 'Nice!', 1500);
      else showToast(`The word was ${answer}`, 2500);

      setTimeout(() => showWordSummary(wordResult), won ? 1600 : 2600);
    }, WORD_LENGTH * 150 + 300);
  }

  saveDayProgress();
}

function shakeRow(rowIdx) {
  const row = $(`row-${rowIdx}`);
  row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 500);
}

// ─── Between-word summary modal ───────────────────────────
function showWordSummary(result) {
  const isLast = state.currentWordIndex >= state.words.length - 1;

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
  if (isLast) {
    nextBtn.textContent = 'See Final Summary';
  } else {
    nextBtn.textContent = `Next Word (${state.currentWordIndex + 2} of ${state.words.length})`;
  }

  $('word-summary-modal').classList.add('visible');
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
  keyStates = {};
  updateWordCounter();
  renderBoard();
  renderKeyboard();
  saveDayProgress();
}

// ─── Final summary ─────────────────────────────────────────
function showFinalSummary() {
  state.gameOver = true;

  // Update streak
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

  // Share text
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

// ─── How-to-play modal ─────────────────────────────────────
$('help-btn').addEventListener('click', () => $('help-modal').classList.add('visible'));
$('help-close').addEventListener('click', () => $('help-modal').classList.remove('visible'));

// Close modals on backdrop click
['stats-modal','help-modal'].forEach(id => {
  $(id).addEventListener('click', e => { if (e.target.id === id) $(id).classList.remove('visible'); });
});

// ─── Word counter ─────────────────────────────────────────
function updateWordCounter() {
  $('word-counter').textContent = `Word ${state.currentWordIndex + 1} of ${state.words.length}`;
}

// ─── Date util ────────────────────────────────────────────
function getPrevDateKey(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Init ─────────────────────────────────────────────────
async function init() {
  const ok = await loadWords();
  if (!ok) return;

  // Restore day progress if exists
  const saved = loadDayProgress();
  if (saved) {
    state.currentWordIndex = saved.currentWordIndex;
    state.allResults = saved.allResults;
    state.gameOver = saved.gameOver;

    // Replay key states from all previous words
    state.allResults.forEach(r => {
      r.guesses.forEach(g => {
        const res = evaluateGuess(g, r.word);
        updateKeyStates(g, res);
      });
    });

    if (state.gameOver || state.currentWordIndex >= state.words.length) {
      showFinalSummary();
      return;
    }
  }

  // Show theme banner
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
