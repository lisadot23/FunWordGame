// ============================================================
// WORDLE GAME — Main Logic  (js/game.js)
//
// Requires js/words.js to be loaded first (defines ANSWER_POOL
// and VALID_WORDS_SET).
//
// Word selection logic:
//   Regular days  → date-seeded shuffle of ANSWER_POOL, same
//                   words for all players on a given date.
//   Theme days    → words drawn from the matching pool in
//                   words.json (_dynamic_holidays or a fixed
//                   dated entry), seeded by date for variety.
//   words.json    → _dynamic_holidays block covers all floating
//                   holidays (Thanksgiving, Easter, etc.) and
//                   recurring fixed-date ones. A dated entry
//                   (e.g. "2026-05-04") overrides everything
//                   for that specific date, useful for one-off
//                   events or custom days.
// ============================================================

const WORD_LENGTH   = 5;
const MAX_GUESSES   = 6;
const WORDS_PER_DAY = 10;

// Feedback form URL — replace with your Google Form link
const FEEDBACK_URL = 'YOUR_GOOGLE_FORM_URL_HERE';

let state = {
  todayKey: '',
  theme: null,
  words: [],
  currentWordIndex: 0,
  currentGuess: '',
  guesses: [],       // guesses for the current word
  allResults: [],    // [{word, guesses, solved, guessCount}]
  gameOver: false,
  wordComplete: false, // blocks extra input during win/loss animation
  wordsData: null,
};

// ─── Stats (localStorage) ─────────────────────────────────────
function loadStats() {
  try {
    return JSON.parse(localStorage.getItem('wordleStats')) || defaultStats();
  } catch { return defaultStats(); }
}

function defaultStats() {
  return {
    totalGames: 0, totalWins: 0,
    currentStreak: 0, longestStreak: 0,
    lastPlayedDate: null,
    guessDistribution: { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, X:0 },
  };
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
    dateKey:          state.todayKey,
    currentWordIndex: state.currentWordIndex,
    allResults:       state.allResults,
    gameOver:         state.gameOver,
  }));
}

// ─── Date helpers ──────────────────────────────────────────────
function getTodayKey() {
  const d = new Date();
  return _fmtDate(d);
}

function getPrevDateKey(dateKey) {
  const d = new Date(dateKey + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return _fmtDate(d);
}

function _fmtDate(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Holiday engine ────────────────────────────────────────────
// Returns the YYYY-MM-DD key for each dynamic holiday in a given year.
// Keys match _dynamic_holidays keys in words.json exactly.
function getHolidayDates(year) {
  const map = {};

  // ── Helpers ─────────────────────────────────────────────────
  function fixed(month, day) {         // month 1-indexed
    return _fmtDate(new Date(year, month - 1, day));
  }
  function nthWeekday(month, weekday, n) { // weekday: 0=Sun … 6=Sat
    const d = new Date(year, month - 1, 1);
    let count = 0;
    while (true) {
      if (d.getDay() === weekday) { if (++count === n) return _fmtDate(d); }
      d.setDate(d.getDate() + 1);
    }
  }
  function lastWeekday(month, weekday) {
    const d = new Date(year, month, 0); // last day of month
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
    return _fmtDate(d);
  }

  // ── Easter (Anonymous Gregorian algorithm) ───────────────────
  function easterDate() {
    const a = year % 19, b = Math.floor(year/100), c = year % 100;
    const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
    const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
    const i = Math.floor(c/4), k = c % 4;
    const l = (32+2*e+2*i-h-k) % 7;
    const m = Math.floor((a+11*h+22*l)/451);
    const month = Math.floor((h+l-7*m+114)/31);
    const day   = ((h+l-7*m+114) % 31) + 1;
    return _fmtDate(new Date(year, month - 1, day));
  }

  // ── Hanukkah (25 Kislev) ─────────────────────────────────────
  // The Hebrew calendar requires a full ecclesiastical calculation.
  // This lookup table covers 2024–2040; beyond that the holiday
  // simply won't trigger (regular day instead of showing wrong data).
  const hanukkahTable = {
    2024:'2024-12-26', 2025:'2025-12-15', 2026:'2026-12-05',
    2027:'2027-12-25', 2028:'2028-12-13', 2029:'2029-12-02',
    2030:'2030-12-21', 2031:'2031-12-10', 2032:'2032-11-28',
    2033:'2033-12-18', 2034:'2034-12-07', 2035:'2035-11-27',
    2036:'2036-12-15', 2037:'2037-12-04', 2038:'2038-12-24',
    2039:'2039-12-13', 2040:'2040-12-02',
  };

  // ── Fixed-date holidays ──────────────────────────────────────
  map['new_years']             = fixed(1, 1);
  map['groundhog_day']         = fixed(2, 2);
  map['pizza_day']             = fixed(2, 9);   // National Pizza Day
  map['valentines']            = fixed(2, 14);
  map['washingtons_birthday']  = fixed(2, 22);  // actual birthday
  map['world_wildlife_day']    = fixed(3, 3);
  map['pi_day']                = fixed(3, 14);
  map['st_patricks']           = fixed(3, 17);
  map['april_fools']           = fixed(4, 1);
  map['earth_day']             = fixed(4, 22);
  map['shakespeare_day']       = fixed(4, 23);
  map['star_wars_day']         = fixed(5, 4);
  map['cinco_de_mayo']         = fixed(5, 5);
  map['flag_day']              = fixed(6, 14);
  map['juneteenth']            = fixed(6, 19);
  map['july4']                 = fixed(7, 4);
  map['harry_potter_day']      = fixed(7, 31);  // Harry's birthday
  map['mario_day']             = fixed(3, 10);  // MAR10
  map['halloween']             = fixed(10, 31);
  map['veterans_day']          = fixed(11, 11);
  map['christmas']             = fixed(12, 25);

  // ── Floating holidays ────────────────────────────────────────
  map['mlk_day']       = nthWeekday(1,  1, 3);  // 3rd Mon Jan
  map['easter']        = easterDate();
  map['mothers_day']   = nthWeekday(5,  0, 2);  // 2nd Sun May
  map['memorial_day']  = lastWeekday(5,  1);     // last Mon May
  map['fathers_day']   = nthWeekday(6,  0, 3);  // 3rd Sun Jun
  map['labor_day']     = nthWeekday(9,  1, 1);  // 1st Mon Sep
  map['thanksgiving']  = nthWeekday(11, 4, 4);  // 4th Thu Nov
  map['hanukkah']      = hanukkahTable[year] || null;

  return map; // { holiday_key: 'YYYY-MM-DD', ... }
}

// ─── Date-seeded shuffle (mulberry32 PRNG) ─────────────────────
// Converts a date string into a stable integer seed so all players
// get the identical word selection on the same date.
function dateToSeed(dateKey) {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = Math.imul(31, h) + dateKey.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

function seededShuffle(arr, seed) {
  let s = seed;
  function rand() {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Load words for today ──────────────────────────────────────
async function loadWords() {
  if (typeof ANSWER_POOL === 'undefined' || typeof VALID_WORDS_SET === 'undefined') {
    showError('Word lists failed to load. Please refresh.');
    return false;
  }

  state.todayKey = getTodayKey();
  const year     = new Date().getFullYear();
  const seed     = dateToSeed(state.todayKey);

  // Fetch words.json (non-fatal on failure — regular days still work)
  try {
    const res = await fetch('words.json?v=' + Date.now());
    state.wordsData = await res.json();
  } catch (e) {
    state.wordsData = {};
    console.warn('Could not fetch words.json — using auto-generated words.');
  }

  // ── Priority 1: explicit dated entry in words.json ────────────
  // Useful for one-off events. Overrides everything else.
  const datedEntry = state.wordsData[state.todayKey];
  if (datedEntry && datedEntry.theme && Array.isArray(datedEntry.pool) && datedEntry.pool.length >= WORDS_PER_DAY) {
    return _applyTheme(datedEntry.theme, datedEntry.pool, seed);
  }

  // ── Priority 2: dynamic holiday match ────────────────────────
  const holidayDates = getHolidayDates(year);
  const holidays     = state.wordsData['_dynamic_holidays'] || {};

  for (const [key, dateStr] of Object.entries(holidayDates)) {
    if (dateStr === state.todayKey && holidays[key]) {
      const entry = holidays[key];
      if (entry.theme && Array.isArray(entry.pool) && entry.pool.length >= WORDS_PER_DAY) {
        return _applyTheme(entry.theme, entry.pool, seed);
      }
    }
  }

  // ── Priority 3: regular day — auto-generate from ANSWER_POOL ─
  state.theme = null;
  if (ANSWER_POOL.length === 0) {
    showError('Answer pool is empty. Check js/words.js.');
    return false;
  }
  state.words = seededShuffle(ANSWER_POOL, seed).slice(0, WORDS_PER_DAY);
  return true;
}

// Shared helper: apply a theme pool, seeded-shuffle it, take WORDS_PER_DAY
function _applyTheme(themeName, pool, seed) {
  const cleaned = pool
    .map(w => w.toUpperCase().trim())
    .filter(w => w.length === WORD_LENGTH && /^[A-Z]+$/.test(w));

  if (cleaned.length < WORDS_PER_DAY) {
    console.warn(`Theme "${themeName}" has only ${cleaned.length} valid words (need ${WORDS_PER_DAY}). Using all of them.`);
  }

  state.theme = themeName;
  state.words = seededShuffle(cleaned, seed).slice(0, Math.min(WORDS_PER_DAY, cleaned.length));

  // Ensure all theme words pass dictionary validation (handles proper nouns)
  state.words.forEach(w => VALID_WORDS_SET.add(w));
  return true;
}

// ─── Validate a guess ─────────────────────────────────────────
function isValidWord(word) {
  if (state.words.includes(word)) return true;  // always accept today's answers
  return VALID_WORDS_SET.has(word);
}

// ─── Evaluate a guess ─────────────────────────────────────────
function evaluateGuess(guess, answer) {
  const result   = Array(WORD_LENGTH).fill('absent');
  const answerArr = answer.split('');
  const guessArr  = guess.split('');
  const used      = Array(WORD_LENGTH).fill(false);

  guessArr.forEach((letter, i) => {
    if (letter === answerArr[i]) { result[i] = 'correct'; used[i] = true; }
  });
  guessArr.forEach((letter, i) => {
    if (result[i] === 'correct') return;
    const foundIdx = answerArr.findIndex((l, j) => l === letter && !used[j]);
    if (foundIdx !== -1) { result[i] = 'present'; used[foundIdx] = true; }
  });
  return result;
}

// ─── Keyboard state tracking ───────────────────────────────────
let keyStates = {};

function updateKeyStates(guess, result) {
  guess.split('').forEach((letter, i) => {
    const current = keyStates[letter];
    const next    = result[i];
    if (current === 'correct') return;
    if (current === 'present' && next !== 'correct') return;
    keyStates[letter] = next;
  });
  renderKeyboard();
}

function rebuildKeyStates() {
  keyStates = {};
  state.allResults.forEach(r => {
    r.guesses.forEach(g => updateKeyStates(g, evaluateGuess(g, r.word)));
  });
  state.guesses.forEach(g => updateKeyStates(g, evaluateGuess(g, currentWord())));
}

// ─── DOM helpers ───────────────────────────────────────────────
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
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), duration);
}

// ─── Render board ──────────────────────────────────────────────
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

  state.guesses.forEach((g, r) => fillRow(r, g, evaluateGuess(g, currentWord()), false));

  if (!state.wordComplete && !state.gameOver) fillCurrentInput();
}

function currentWord() { return state.words[state.currentWordIndex]; }

function fillRow(rowIdx, guess, result, animate) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`tile-${rowIdx}-${c}`);
    if (!tile) continue;
    tile.textContent = guess[c] || '';
    if (animate) {
      setTimeout(() => tile.setAttribute('data-state', result[c]), c * 150);
    } else {
      tile.setAttribute('data-state', result[c]);
    }
  }
}

function fillCurrentInput() {
  const rowIdx = state.guesses.length;
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

// ─── Render keyboard ───────────────────────────────────────────
function renderKeyboard() {
  const rows = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','⌫'],
  ];
  const kb = $('keyboard');
  if (!kb) return;
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

// ─── Handle input ──────────────────────────────────────────────
function handleKey(key) {
  if (state.gameOver || state.wordComplete) return;
  if (key === '⌫' || key === 'Backspace') {
    state.currentGuess = state.currentGuess.slice(0, -1);
    fillCurrentInput();
    return;
  }
  if (key === 'ENTER' || key === 'Enter') { submitGuess(); return; }
  if (/^[A-Za-z]$/.test(key) && state.currentGuess.length < WORD_LENGTH) {
    state.currentGuess += key.toUpperCase();
    fillCurrentInput();
  }
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  handleKey(e.key);
});

// ─── Submit guess ──────────────────────────────────────────────
function submitGuess() {
  if (state.currentGuess.length < WORD_LENGTH) {
    shakeRow(state.guesses.length);
    showToast('Not enough letters');
    return;
  }

  const guess = state.currentGuess.toUpperCase();

  if (!isValidWord(guess)) {
    shakeRow(state.guesses.length);
    showToast('Not in word list');
    return;
  }

  const answer = currentWord();
  const result = evaluateGuess(guess, answer);
  const rowIdx = state.guesses.length;

  state.wordComplete = true;  // lock input immediately
  state.guesses.push(guess);
  state.currentGuess = '';

  fillRow(rowIdx, guess, result, true);
  updateKeyStates(guess, result);

  const won  = result.every(r => r === 'correct');
  const lost = !won && state.guesses.length >= MAX_GUESSES;

  if (won || lost) {
    const wordResult = {
      word: answer,
      guesses: [...state.guesses],
      solved: won,
      guessCount: won ? state.guesses.length : null,
    };
    state.allResults.push(wordResult);

    const stats = loadStats();
    stats.totalGames++;
    if (won) { stats.totalWins++; stats.guessDistribution[state.guesses.length]++; }
    else { stats.guessDistribution['X']++; }
    saveStats(stats);

    const animDelay = WORD_LENGTH * 150 + 300;
    setTimeout(() => {
      if (won) {
        const toasts = ['Genius!','Magnificent!','Impressive!','Splendid!','Great!','Phew!'];
        showToast(toasts[state.guesses.length - 1] || 'Nice!', 1500);
        setTimeout(() => showWordSummary(wordResult), 1600);
      } else {
        showToast(`The word was ${answer}`, 2500);
        setTimeout(() => showWordSummary(wordResult), 2600);
      }
    }, animDelay);
  } else {
    state.wordComplete = false;
  }

  saveDayProgress();
}

function shakeRow(rowIdx) {
  const row = $(`row-${rowIdx}`);
  if (!row) return;
  row.classList.add('shake');
  setTimeout(() => row.classList.remove('shake'), 500);
}

// ─── Word summary modal ────────────────────────────────────────
function showWordSummary(result) {
  const isLast = state.currentWordIndex >= state.words.length - 1;

  $('ws-word').textContent   = result.word;
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

  $('ws-next-btn').textContent = isLast
    ? 'See Final Summary'
    : `Next Word (${state.currentWordIndex + 2} of ${state.words.length})`;

  $('word-summary-modal').classList.add('visible');
}

$('ws-next-btn').addEventListener('click', () => {
  $('word-summary-modal').classList.remove('visible');
  if (state.currentWordIndex >= state.words.length - 1) {
    showFinalSummary();
  } else {
    advanceToNextWord();
  }
});

// ─── Advance to next word ──────────────────────────────────────
function advanceToNextWord() {
  state.currentWordIndex++;
  state.guesses      = [];
  state.currentGuess = '';
  state.gameOver     = false;
  state.wordComplete = false;
  keyStates          = {};
  updateWordCounter();
  renderBoard();
  renderKeyboard();
  saveDayProgress();
}

// ─── Final summary ─────────────────────────────────────────────
function showFinalSummary() {
  state.gameOver = true;

  const stats     = loadStats();
  const today     = state.todayKey;
  const yesterday = getPrevDateKey(today);

  if (stats.lastPlayedDate === yesterday) {
    stats.currentStreak++;
  } else if (stats.lastPlayedDate !== today) {
    stats.currentStreak = 1;
  }
  stats.longestStreak  = Math.max(stats.longestStreak, stats.currentStreak);
  stats.lastPlayedDate = today;
  saveStats(stats);

  const solved = state.allResults.filter(r => r.solved).length;
  const total  = state.allResults.length;

  $('fs-score').textContent   = `${solved} / ${total} solved`;
  $('fs-streak').textContent  = `🔥 Current streak: ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`;
  $('fs-longest').textContent = `Best streak: ${stats.longestStreak} days`;

  const grid = $('fs-grid');
  grid.innerHTML = '';
  state.allResults.forEach((r, i) => {
    const row   = document.createElement('div');
    row.className = 'fs-row';
    const label = document.createElement('span');
    label.className   = 'fs-label';
    label.textContent = `${i + 1}. ${r.word}`;
    const badge = document.createElement('span');
    badge.className   = 'fs-badge ' + (r.solved ? 'badge-win' : 'badge-loss');
    badge.textContent = r.solved ? `${r.guessCount}/6` : 'X/6';
    row.appendChild(label);
    row.appendChild(badge);
    grid.appendChild(row);
  });

  $('fs-share-text').value = buildShareText(solved, total);
  $('final-summary-modal').classList.add('visible');
  saveDayProgress();
}

function buildShareText(solved, total) {
  const themeLabel = state.theme ? ` (${state.theme})` : '';
  let text = `FunWordGame${themeLabel} — ${state.todayKey}\n${solved}/${total} solved\n\n`;
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
  navigator.clipboard.writeText($('fs-share-text').value)
    .then(() => showToast('Copied!'));
});

$('fs-play-again').addEventListener('click', () => {
  $('final-summary-modal').classList.remove('visible');
  showToast("You've finished today's words! Come back tomorrow.", 3000);
});

// ─── Stats modal ───────────────────────────────────────────────
$('stats-btn').addEventListener('click', () => { renderStatsModal(); $('stats-modal').classList.add('visible'); });
$('stats-close').addEventListener('click', () => $('stats-modal').classList.remove('visible'));

function renderStatsModal() {
  const stats = loadStats();
  $('stat-games').textContent   = stats.totalGames;
  $('stat-winpct').textContent  = stats.totalGames > 0
    ? Math.round(stats.totalWins / stats.totalGames * 100) : 0;
  $('stat-streak').textContent  = stats.currentStreak;
  $('stat-longest').textContent = stats.longestStreak;

  const dist = $('guess-dist');
  dist.innerHTML = '';
  const max = Math.max(...Object.values(stats.guessDistribution), 1);
  [1,2,3,4,5,6].forEach(n => {
    const count = stats.guessDistribution[n] || 0;
    const row = document.createElement('div');
    row.className = 'dist-row';
    row.innerHTML = `
      <span class="dist-label">${n}</span>
      <div class="dist-bar-wrap">
        <div class="dist-bar" style="width:${Math.max(count/max*100, 4)}%">${count}</div>
      </div>`;
    dist.appendChild(row);
  });
}

// ─── Help modal ────────────────────────────────────────────────
$('help-btn').addEventListener('click', () => $('help-modal').classList.add('visible'));
$('help-close').addEventListener('click', () => $('help-modal').classList.remove('visible'));

['stats-modal','help-modal'].forEach(id => {
  $(id).addEventListener('click', e => { if (e.target.id === id) $(id).classList.remove('visible'); });
});

// ─── Feedback button ───────────────────────────────────────────
const feedbackBtn = $('feedback-btn');
if (feedbackBtn) {
  feedbackBtn.addEventListener('click', () => {
    if (FEEDBACK_URL && FEEDBACK_URL !== 'YOUR_GOOGLE_FORM_URL_HERE') {
      window.open(FEEDBACK_URL, '_blank', 'noopener');
    } else {
      showToast('Feedback form not configured yet.');
    }
  });
}

// ─── Word counter ──────────────────────────────────────────────
function updateWordCounter() {
  const el = $('word-counter');
  if (el) el.textContent = `Word ${state.currentWordIndex + 1} of ${state.words.length}`;
}

// ─── Init ──────────────────────────────────────────────────────
async function init() {
  const ok = await loadWords();
  if (!ok) return;

  if (state.theme) {
    document.body.classList.add('theme-day');
    const banner = $('theme-banner');
    if (banner) {
      banner.textContent  = `🎯 Today's theme: ${state.theme}`;
      banner.style.display = 'block';
    }
  }

  const saved = loadDayProgress();
  if (saved) {
    state.currentWordIndex = saved.currentWordIndex;
    state.allResults       = saved.allResults;
    state.gameOver         = saved.gameOver;
    rebuildKeyStates();
    if (state.gameOver || state.currentWordIndex >= state.words.length) {
      showFinalSummary();
      return;
    }
  }

  updateWordCounter();
  renderBoard();
  renderKeyboard();
}

init();
