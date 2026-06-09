// game.js — FunWordGame core logic

// ─── Constants ──────────────────────────────────────────────────────────────

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const DEFAULT_WORDS_PER_DAY = 10;
const MAX_WORDS_PER_DAY = 10;
const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScrQOgBeGKO_KCit6xhfxfAwOmsSygyTP7P69mK47sA-bH60g/viewform?usp=dialog";

// Hanukkah lookup (month is 1-indexed; days can exceed month end — handled below)
// Stored as {month, startDay, endDay} where endDay may be > 30 (wraps to next month)
const HANUKKAH_DATES = {
  2024: { month: 12, startDay: 25, endDay: 32 },
  2025: { month: 12, startDay: 14, endDay: 22 },
  2026: { month: 12, startDay:  4, endDay: 12 },
  2027: { month: 11, startDay: 24, endDay: 32 },
  2028: { month: 12, startDay: 12, endDay: 20 },
  2029: { month: 12, startDay:  1, endDay:  9 },
  2030: { month: 11, startDay: 20, endDay: 28 },
  2031: { month: 12, startDay:  8, endDay: 16 },
  2032: { month: 11, startDay: 26, endDay: 34 },
  2033: { month: 11, startDay: 15, endDay: 23 },
  2034: { month: 12, startDay:  4, endDay: 12 },
  2035: { month: 11, startDay: 24, endDay: 32 },
  2036: { month: 12, startDay: 12, endDay: 20 },
  2037: { month: 12, startDay:  1, endDay:  9 },
  2038: { month: 11, startDay: 21, endDay: 29 },
  2039: { month: 12, startDay: 10, endDay: 18 },
  2040: { month: 11, startDay: 28, endDay: 36 },
};

// ─── PRNG ───────────────────────────────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dateSeed(dateStr) {
  // dateStr: "YYYY-MM-DD"
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(str) {
  // Returns {year, month (1-based), day, dow (0=Sun)}
  const d = new Date(str + "T00:00:00");
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    dow: d.getDay(),
  };
}

// nth weekday of a month: nth=1..5, dow=0..6
function nthWeekday(year, month, nth, dow) {
  const first = new Date(year, month - 1, 1).getDay();
  let day = 1 + ((dow - first + 7) % 7) + (nth - 1) * 7;
  return day;
}

// last weekday of a month
function lastWeekday(year, month, dow) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = new Date(year, month - 1, daysInMonth).getDay();
  let day = daysInMonth - ((lastDay - dow + 7) % 7);
  return day;
}

// Easter via Computus (Gregorian)
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function isHanukkah(year, month, day) {
  const entry = HANUKKAH_DATES[year];
  if (!entry) return false;
  const startM = entry.month;
  const startD = entry.startDay;
  const endD = entry.endDay;

  // Compute absolute day-of-year offsets for comparison
  // Simpler: convert to comparable integer
  function toAbsolute(m, d) {
    return m * 100 + d; // works as long as we handle month wrap correctly
  }

  // Build date range properly handling month overflow
  const dates = [];
  let m = startM;
  let d = startD;
  for (let i = 0; i < 8; i++) {
    const daysInM = new Date(year, m, 0).getDate();
    let dd = d + i;
    let mm = m;
    if (dd > daysInM) {
      dd -= daysInM;
      mm += 1;
      if (mm > 12) mm = 1;
    }
    dates.push({ month: mm, day: dd });
  }
  return dates.some((dt) => dt.month === month && dt.day === day);
}

// ─── Theme resolution ────────────────────────────────────────────────────────

let _themeData = null;

async function loadThemeData() {
  if (_themeData) return _themeData;
  try {
    const resp = await fetch("words.json");
    _themeData = await resp.json();
  } catch (e) {
    _themeData = { themes: [] };
  }
  return _themeData;
}

function resolveTheme(dateInfo, themeData) {
  const { year, month, day, dow } = dateInfo;

  for (const theme of themeData.themes) {
    let match = false;

    if (theme.type === "fixed") {
      match = theme.month === month && theme.day === day;
    } else if (theme.type === "easter") {
      const e = easterDate(year);
      match = e.month === month && e.day === day;
    } else if (theme.type === "hanukkah") {
      match = isHanukkah(year, month, day);
    } else if (theme.type === "floating") {
      const rule = theme.rule;
      const tm = theme.month;
      if (tm !== month) continue;

      if (rule === "first_monday") {
        match = day === nthWeekday(year, month, 1, 1);
      } else if (rule === "second_sunday") {
        match = day === nthWeekday(year, month, 2, 0);
      } else if (rule === "third_monday") {
        match = day === nthWeekday(year, month, 3, 1);
      } else if (rule === "third_sunday") {
        match = day === nthWeekday(year, month, 3, 0);
      } else if (rule === "last_monday") {
        match = day === lastWeekday(year, month, 1);
      } else if (rule === "fourth_thursday") {
        match = day === nthWeekday(year, month, 4, 4);
      }
    }

    if (match) return theme;
  }
  return null;
}

// ─── Word generation ─────────────────────────────────────────────────────────

function generateDailyWords(dateStr, theme, wordsPerDay) {
  const rng = mulberry32(dateSeed(dateStr));

  let pool;
  if (theme) {
    pool = theme.words.filter((w) => w.length === WORD_LENGTH && /^[A-Z]+$/.test(w));
  } else {
    pool = ANSWER_POOL.filter((w) => w.length === WORD_LENGTH);
  }

  const shuffled = seededShuffle(pool, rng);
  const n = theme ? Math.min(wordsPerDay, shuffled.length) : Math.min(wordsPerDay, shuffled.length);
  return shuffled.slice(0, n);
}

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS = {
  get(key, def = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

const KEYS = {
  WORDS_PER_DAY: "fwg_wpd",
  SESSION_DATE: "fwg_date",
  SESSION_WORDS: "fwg_words",
  SESSION_IDX: "fwg_idx",
  SESSION_GUESSES: "fwg_guesses",  // array of arrays (per-word guess history)
  SESSION_OUTCOMES: "fwg_outcomes", // array of "win"|"loss"|null
  STATS: "fwg_stats",
  KB_COLORS: "fwg_kb",             // per-word kb state — rebuilt on load
};

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  today: "",
  theme: null,
  wordsPerDay: DEFAULT_WORDS_PER_DAY,
  dailyWords: [],       // array of word strings for today
  currentWordIdx: 0,    // which word in the sequence we're on
  guesses: [],          // [[guess, guess, ...], ...] per word
  outcomes: [],         // "win" | "loss" | null per word
  currentInput: [],     // letters typed so far for current guess
  gameOver: false,      // true when current word is resolved
  sessionComplete: false,
};

// ─── Stats ────────────────────────────────────────────────────────────────────

function defaultStats() {
  return {
    totalPlayed: 0,
    totalWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  };
}

function loadStats() {
  return LS.get(KEYS.STATS, defaultStats());
}

function saveStats(stats) {
  LS.set(KEYS.STATS, stats);
}

function recordResult(won, guessCount) {
  const stats = loadStats();
  stats.totalPlayed++;
  if (won) {
    stats.totalWon++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
    stats.guessDist[guessCount] = (stats.guessDist[guessCount] || 0) + 1;
  } else {
    stats.currentStreak = 0;
  }
  saveStats(stats);
}

// ─── Session persistence ──────────────────────────────────────────────────────

function saveSession() {
  LS.set(KEYS.SESSION_DATE, state.today);
  LS.set(KEYS.SESSION_WORDS, state.dailyWords);
  LS.set(KEYS.SESSION_IDX, state.currentWordIdx);
  LS.set(KEYS.SESSION_GUESSES, state.guesses);
  LS.set(KEYS.SESSION_OUTCOMES, state.outcomes);
}

function clearSessionProgress() {
  LS.remove(KEYS.SESSION_IDX);
  LS.remove(KEYS.SESSION_GUESSES);
  LS.remove(KEYS.SESSION_OUTCOMES);
  // Note: SESSION_WORDS and SESSION_DATE kept — they describe the day's word set
}

// ─── UI references ────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const ui = {
  board: () => $("board"),
  keyboard: () => $("keyboard"),
  themeBanner: () => $("theme-banner"),
  themeBannerText: () => $("theme-banner-text"),
  wordCounter: () => $("word-counter"),
  messageBox: () => $("message-box"),

  // Modals
  helpModal: () => $("help-modal"),
  statsModal: () => $("stats-modal"),
  settingsModal: () => $("settings-modal"),
  summaryModal: () => $("summary-modal"),
  confirmModal: () => $("confirm-modal"),
  sessionEndModal: () => $("session-end-modal"),

  // Summary modal
  summaryResult: () => $("summary-result"),
  summaryWord: () => $("summary-word"),
  summaryGrid: () => $("summary-grid"),
  summaryDictLink: () => $("summary-dict-link"),
  summaryCelebration: () => $("summary-celebration"),
  summaryTip: () => $("summary-tip"),
  summaryNextBtn: () => $("summary-next-btn"),

  // Settings
  wpdSlider: () => $("wpd-slider"),
  wpdDisplay: () => $("wpd-display"),

  // Stats modal
  statPlayed: () => $("stat-played"),
  statWinPct: () => $("stat-win-pct"),
  statStreak: () => $("stat-streak"),
  statMaxStreak: () => $("stat-max-streak"),
  statGuessDist: () => $("stat-guess-dist"),

  // Confirm modal
  confirmText: () => $("confirm-text"),
  confirmYes: () => $("confirm-yes"),
  confirmNo: () => $("confirm-no"),

  // Fireworks canvas
  fireworksCanvas: () => $("fireworks-canvas"),
};

// ─── Board rendering ──────────────────────────────────────────────────────────

function buildBoard() {
  const board = ui.board();
  board.innerHTML = "";
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement("div");
    row.className = "board-row";
    row.id = `row-${r}`;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.id = `tile-${r}-${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
}

function setTile(row, col, letter, state_cls) {
  const tile = $(`tile-${row}-${col}`);
  if (!tile) return;
  tile.textContent = letter || "";
  tile.className = "tile" + (state_cls ? " " + state_cls : "") + (letter ? " filled" : "");
}

function renderGuesses(guesses, answer) {
  guesses.forEach((guess, r) => {
    const colors = scoreGuess(guess, answer);
    for (let c = 0; c < WORD_LENGTH; c++) {
      setTile(r, c, guess[c], colors[c]);
    }
  });
}

function renderCurrentInput() {
  const r = state.guesses[state.currentWordIdx]
    ? state.guesses[state.currentWordIdx].length
    : 0;
  for (let c = 0; c < WORD_LENGTH; c++) {
    setTile(r, c, state.currentInput[c] || "", c < state.currentInput.length ? "active" : "");
  }
}

function clearCurrentRow() {
  const r = state.guesses[state.currentWordIdx]
    ? state.guesses[state.currentWordIdx].length
    : 0;
  for (let c = 0; c < WORD_LENGTH; c++) {
    setTile(r, c, "", "");
  }
}

// ─── Guess scoring ────────────────────────────────────────────────────────────

function scoreGuess(guess, answer) {
  // Returns array of "correct" | "present" | "absent" per letter
  const result = Array(WORD_LENGTH).fill("absent");
  const answerCounts = {};
  for (const ch of answer) answerCounts[ch] = (answerCounts[ch] || 0) + 1;

  // First pass: greens
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      answerCounts[guess[i]]--;
    }
  }
  // Second pass: yellows
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    if (answerCounts[guess[i]] > 0) {
      result[i] = "present";
      answerCounts[guess[i]]--;
    }
  }
  return result;
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

const KB_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"],
];

function buildKeyboard() {
  const kb = ui.keyboard();
  kb.innerHTML = "";
  KB_ROWS.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kb-row";
    row.forEach((key) => {
      const btn = document.createElement("button");
      btn.className = "key" + (key.length > 1 ? " key-wide" : "");
      btn.id = `key-${key}`;
      btn.textContent = key;
      btn.setAttribute("data-key", key);
      btn.addEventListener("click", () => handleKey(key));
      rowEl.appendChild(btn);
    });
    kb.appendChild(rowEl);
  });
}

function updateKeyboard(guess, answer) {
  const colors = scoreGuess(guess, answer);
  const priority = { correct: 3, present: 2, absent: 1 };
  guess.split("").forEach((ch, i) => {
    const btn = $(`key-${ch}`);
    if (!btn) return;
    const current = btn.getAttribute("data-state") || "";
    const newState = colors[i];
    if ((priority[newState] || 0) > (priority[current] || 0)) {
      btn.setAttribute("data-state", newState);
      btn.className = btn.className.replace(/ state-\w+/g, "") + ` state-${newState}`;
    }
  });
}

function resetKeyboard() {
  KB_ROWS.flat().forEach((key) => {
    const btn = $(`key-${key}`);
    if (!btn) return;
    btn.removeAttribute("data-state");
    btn.className = "key" + (key.length > 1 ? " key-wide" : "");
  });
}

function rebuildKeyboardState() {
  // Replay all guesses for current word to restore keyboard colors
  resetKeyboard();
  const answer = state.dailyWords[state.currentWordIdx];
  if (!answer) return;
  const guesses = state.guesses[state.currentWordIdx] || [];
  guesses.forEach((g) => updateKeyboard(g, answer));
}

// ─── Input handling ───────────────────────────────────────────────────────────

function handleKey(key) {
  if (state.gameOver || state.sessionComplete) return;

  const k = key.toUpperCase();
  if (k === "ENTER") {
    submitGuess();
  } else if (k === "⌫" || k === "BACKSPACE") {
    if (state.currentInput.length > 0) {
      state.currentInput.pop();
      renderCurrentInput();
    }
  } else if (/^[A-Z]$/.test(k) && state.currentInput.length < WORD_LENGTH) {
    state.currentInput.push(k);
    renderCurrentInput();
    animateTilePop(state.guesses[state.currentWordIdx]
      ? state.guesses[state.currentWordIdx].length
      : 0, state.currentInput.length - 1);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Enter") handleKey("ENTER");
  else if (e.key === "Backspace") handleKey("⌫");
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});

function animateTilePop(row, col) {
  const tile = $(`tile-${row}-${col}`);
  if (!tile) return;
  tile.classList.remove("pop");
  void tile.offsetWidth;
  tile.classList.add("pop");
}

// ─── Guess submission ─────────────────────────────────────────────────────────

function submitGuess() {
  if (state.currentInput.length < WORD_LENGTH) {
    shakeRow(state.guesses[state.currentWordIdx]
      ? state.guesses[state.currentWordIdx].length
      : 0);
    showMessage("Not enough letters");
    return;
  }

  const guess = state.currentInput.join("");
  const answer = state.dailyWords[state.currentWordIdx];

  // Validate
  const validSet = VALID_WORDS_SET;
  const isThemeWord = state.theme && state.theme.words.includes(guess);
  if (!validSet.has(guess) && !isThemeWord) {
    shakeRow(state.guesses[state.currentWordIdx]
      ? state.guesses[state.currentWordIdx].length
      : 0);
    showMessage("Not in word list");
    return;
  }

  // Accept guess
  const wordGuesses = state.guesses[state.currentWordIdx] || [];
  const rowIdx = wordGuesses.length;

  wordGuesses.push(guess);
  state.guesses[state.currentWordIdx] = wordGuesses;
  state.currentInput = [];

  // Render with flip animation
  const colors = scoreGuess(guess, answer);
  revealRow(rowIdx, guess, colors, () => {
    updateKeyboard(guess, answer);

    const won = guess === answer;
    const lost = !won && wordGuesses.length >= MAX_GUESSES;

    if (won || lost) {
      state.gameOver = true;
      state.outcomes[state.currentWordIdx] = won ? "win" : "loss";
      recordResult(won, wordGuesses.length);
      saveSession();
      setTimeout(() => showSummaryModal(won, wordGuesses.length, guess, answer), 400);
    } else {
      saveSession();
    }
  });
}

function shakeRow(rowIdx) {
  const row = $(`row-${rowIdx}`);
  if (!row) return;
  row.classList.remove("shake");
  void row.offsetWidth;
  row.classList.add("shake");
}

function revealRow(rowIdx, guess, colors, cb) {
  const delay = 350; // ms per tile
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`tile-${rowIdx}-${c}`);
    if (!tile) continue;
    setTimeout(() => {
      tile.classList.add("flip");
      setTimeout(() => {
        tile.textContent = guess[c];
        tile.className = `tile filled ${colors[c]} flipped`;
      }, 150);
    }, c * delay);
  }
  setTimeout(cb, WORD_LENGTH * delay + 150);
}

// ─── Messages ────────────────────────────────────────────────────────────────

let _msgTimer = null;
function showMessage(text, duration = 1500) {
  const box = ui.messageBox();
  box.textContent = text;
  box.classList.add("visible");
  clearTimeout(_msgTimer);
  _msgTimer = setTimeout(() => box.classList.remove("visible"), duration);
}

// ─── Summary modal ────────────────────────────────────────────────────────────

function showSummaryModal(won, guessCount, guess, answer) {
  const modal = ui.summaryModal();

  // Result label
  const resultMsgs = {
    1: "UNBELIEVABLE!",
    2: "GENIUS!",
    3: "Impressive! ✨",
    4: "👍 Nice work!",
    5: "😅 Phew… made it!",
    6: "😬 That was close!",
  };
  ui.summaryResult().textContent = won
    ? (resultMsgs[guessCount] || "Great job!")
    : "Better luck next time!";

  // Word reveal
  ui.summaryWord().textContent = answer;

  // Result grid
  buildSummaryGrid(state.guesses[state.currentWordIdx], answer);

  // Dictionary link — only on non-theme days
  const dictLink = ui.summaryDictLink();
  if (!state.theme) {
    dictLink.href = `https://dictionary.cambridge.org/us/dictionary/english/${answer.toLowerCase()}`;
    dictLink.textContent = `📖 Look up "${answer.toLowerCase()}"`;
    dictLink.style.display = "";
  } else {
    dictLink.style.display = "none";
  }

  // Celebration
  const celebEl = ui.summaryCelebration();
  celebEl.innerHTML = "";
  celebEl.style.display = "";

  if (won) {
    if (guessCount === 1) {
      launchFireworks();
    } else if (guessCount === 2) {
      launchConfetti(celebEl);
    } else if (guessCount === 3) {
      launchTileWave();
    }
  }

  // Tip (failed word, 20% chance)
  const tipEl = ui.summaryTip();
  tipEl.style.display = "none";
  if (!won && Math.random() < 0.2 && WORDLE_TIPS && WORDLE_TIPS.length) {
    const tip = WORDLE_TIPS[Math.floor(Math.random() * WORDLE_TIPS.length)];
    tipEl.textContent = "💡 Tip: " + tip;
    tipEl.style.display = "";
  }

  // Next button label
  const isLast = state.currentWordIdx >= state.dailyWords.length - 1;
  ui.summaryNextBtn().textContent = isLast ? "See Results" : "Next Word →";

  openModal(modal);
}

function buildSummaryGrid(guesses, answer) {
  const grid = ui.summaryGrid();
  grid.innerHTML = "";
  guesses.forEach((g) => {
    const rowEl = document.createElement("div");
    rowEl.className = "summary-row";
    const colors = scoreGuess(g, answer);
    g.split("").forEach((ch, i) => {
      const cell = document.createElement("div");
      cell.className = `summary-tile ${colors[i]}`;
      cell.textContent = ch;
      rowEl.appendChild(cell);
    });
    grid.appendChild(rowEl);
  });
}

// ─── Celebrations ─────────────────────────────────────────────────────────────

// Fireworks (1-guess win)
function launchFireworks() {
  const canvas = ui.fireworksCanvas();
  canvas.style.display = "block";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");

  const particles = [];
  for (let e = 0; e < 8; e++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height * 0.6;
    const hue = Math.floor(Math.random() * 360);
    for (let p = 0; p < 60; p++) {
      const angle = (Math.PI * 2 * p) / 60;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1,
        color: `hsl(${hue},90%,60%)`,
        radius: 3 + Math.random() * 2,
      });
    }
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.07;
      p.alpha -= 0.012;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    });
    frame++;
    if (frame < 120 && particles.some((p) => p.alpha > 0)) {
      requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = "none";
    }
  }
  draw();

  // Skip on click/tap
  canvas.addEventListener("click", () => {
    canvas.style.display = "none";
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }, { once: true });
}

// Confetti (2-guess win)
function launchConfetti(container) {
  const colors = ["#f94144","#f3722c","#f9c74f","#90be6d","#43aa8b","#4d908e","#577590","#277da1"];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-delay:${Math.random()*0.8}s;
      animation-duration:${0.8+Math.random()*1}s;
      width:${6+Math.random()*6}px;
      height:${6+Math.random()*6}px;
      transform:rotate(${Math.random()*360}deg);
    `;
    container.appendChild(el);
  }
  container.style.display = "block";
  setTimeout(() => { container.innerHTML = ""; }, 2500);
}

// Tile wave (3-guess win) — animates the summary grid tiles
function launchTileWave() {
  const tiles = document.querySelectorAll(".summary-tile");
  tiles.forEach((t, i) => {
    setTimeout(() => {
      t.classList.add("wave");
      setTimeout(() => t.classList.remove("wave"), 500);
    }, i * 80);
  });
}

// ─── Next word / session end ───────────────────────────────────────────────────

function handleNextWord() {
  closeAllModals();
  stopCelebrations();

  const isLast = state.currentWordIdx >= state.dailyWords.length - 1;
  if (isLast) {
    showSessionEndModal();
    return;
  }

  state.currentWordIdx++;
  state.gameOver = false;
  state.currentInput = [];
  if (!state.guesses[state.currentWordIdx]) {
    state.guesses[state.currentWordIdx] = [];
  }
  saveSession();

  buildBoard();
  resetKeyboard();
  rebuildKeyboardState();
  renderGuesses(state.guesses[state.currentWordIdx], state.dailyWords[state.currentWordIdx]);
  updateWordCounter();

  // If this word was already completed (page reload mid-session), re-show summary
  const outcome = state.outcomes[state.currentWordIdx];
  if (outcome) {
    state.gameOver = true;
    const guesses = state.guesses[state.currentWordIdx];
    const answer = state.dailyWords[state.currentWordIdx];
    setTimeout(() => showSummaryModal(outcome === "win", guesses.length, guesses[guesses.length - 1], answer), 200);
  }
}

function stopCelebrations() {
  const canvas = ui.fireworksCanvas();
  if (canvas) {
    canvas.style.display = "none";
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }
}

function showSessionEndModal() {
  state.sessionComplete = true;
  const modal = ui.sessionEndModal();
  renderSessionEndStats();
  openModal(modal);
}

function renderSessionEndStats() {
  const wins = state.outcomes.filter((o) => o === "win").length;
  const total = state.outcomes.filter((o) => o !== null).length;
  const stats = loadStats();

  $("se-wins").textContent = `${wins} / ${total}`;
  $("se-streak").textContent = stats.currentStreak;
  $("se-max-streak").textContent = stats.maxStreak;
}

// ─── Stats modal ──────────────────────────────────────────────────────────────

function renderStatsModal() {
  const stats = loadStats();
  ui.statPlayed().textContent = stats.totalPlayed;
  const pct = stats.totalPlayed > 0
    ? Math.round((stats.totalWon / stats.totalPlayed) * 100)
    : 0;
  ui.statWinPct().textContent = pct + "%";
  ui.statStreak().textContent = stats.currentStreak;
  ui.statMaxStreak().textContent = stats.maxStreak;

  const distEl = ui.statGuessDist();
  distEl.innerHTML = "";
  const maxCount = Math.max(1, ...Object.values(stats.guessDist));
  for (let g = 1; g <= MAX_GUESSES; g++) {
    const count = stats.guessDist[g] || 0;
    const pctBar = Math.round((count / maxCount) * 100);
    const row = document.createElement("div");
    row.className = "dist-row";
    row.innerHTML = `
      <span class="dist-label">${g}</span>
      <div class="dist-bar-wrap">
        <div class="dist-bar" style="width:${Math.max(pctBar,4)}%">
          <span>${count}</span>
        </div>
      </div>`;
    distEl.appendChild(row);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function initSettings() {
  const slider = ui.wpdSlider();
  const display = ui.wpdDisplay();
  slider.value = state.wordsPerDay;
  display.textContent = state.wordsPerDay;

  slider.addEventListener("input", () => {
    display.textContent = slider.value;
  });

  slider.addEventListener("change", () => {
    const newVal = parseInt(slider.value, 10);
    if (newVal === state.wordsPerDay) return;

    // Mid-session check: if today's session already started
    const sessionStarted = state.guesses.some((g) => g && g.length > 0);
    if (sessionStarted) {
      showConfirmDialog(
        "Changing this setting will restart today's session from Word 1 and your current progress will be lost. Continue?",
        () => applyWpdChange(newVal),
        () => {
          slider.value = state.wordsPerDay;
          display.textContent = state.wordsPerDay;
        }
      );
    } else {
      applyWpdChange(newVal);
    }
  });
}

function applyWpdChange(newVal) {
  state.wordsPerDay = newVal;
  LS.set(KEYS.WORDS_PER_DAY, newVal);

  // Restart session
  state.currentWordIdx = 0;
  state.guesses = state.dailyWords.map(() => []);
  state.outcomes = state.dailyWords.map(() => null);
  state.currentInput = [];
  state.gameOver = false;
  state.sessionComplete = false;

  // Regenerate words for new count
  state.dailyWords = generateDailyWords(state.today, state.theme, newVal);
  state.guesses = state.dailyWords.map(() => []);
  state.outcomes = state.dailyWords.map(() => null);

  saveSession();
  closeAllModals();
  buildBoard();
  resetKeyboard();
  updateWordCounter();
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function showConfirmDialog(text, onYes, onNo) {
  const modal = ui.confirmModal();
  ui.confirmText().textContent = text;

  ui.confirmYes().onclick = () => {
    closeModal(modal);
    onYes();
  };
  ui.confirmNo().onclick = () => {
    closeModal(modal);
    if (onNo) onNo();
  };

  openModal(modal);
}

// ─── Modal helpers ────────────────────────────────────────────────────────────

function openModal(modal) {
  if (!modal) return;
  closeAllModals();
  modal.classList.add("visible");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("visible");
}

function closeAllModals() {
  document.querySelectorAll(".modal").forEach((m) => m.classList.remove("visible"));
}

// ─── Word counter ──────────────────────────────────────────────────────────────

function updateWordCounter() {
  const el = ui.wordCounter();
  if (!el) return;
  el.textContent = `Word ${state.currentWordIdx + 1} of ${state.dailyWords.length}`;
}

// ─── Theme banner ─────────────────────────────────────────────────────────────

function applyThemeBanner() {
  const banner = ui.themeBanner();
  const text = ui.themeBannerText();
  if (state.theme) {
    text.textContent = `🎉 ${state.theme.name}`;
    banner.style.display = "block";
    document.body.classList.add("theme-day");
  } else {
    banner.style.display = "none";
    document.body.classList.remove("theme-day");
  }
}

// ─── Initialization ────────────────────────────────────────────────────────────

async function init() {
  state.today = todayStr();
  state.wordsPerDay = LS.get(KEYS.WORDS_PER_DAY, DEFAULT_WORDS_PER_DAY);

  // Load theme data and resolve theme
  const themeData = await loadThemeData();
  const dateInfo = parseDate(state.today);
  state.theme = resolveTheme(dateInfo, themeData);

  // Inject theme words into VALID_WORDS_SET
  if (state.theme) {
    state.theme.words.forEach((w) => VALID_WORDS_SET.add(w));
  }

  // Check if we have a saved session for today
  const savedDate = LS.get(KEYS.SESSION_DATE);
  const savedWords = LS.get(KEYS.SESSION_WORDS);
  const savedIdx = LS.get(KEYS.SESSION_IDX);
  const savedGuesses = LS.get(KEYS.SESSION_GUESSES);
  const savedOutcomes = LS.get(KEYS.SESSION_OUTCOMES);

  if (savedDate === state.today && savedWords && savedWords.length > 0) {
    // Restore session
    state.dailyWords = savedWords;
    state.currentWordIdx = savedIdx || 0;
    state.guesses = savedGuesses || savedWords.map(() => []);
    state.outcomes = savedOutcomes || savedWords.map(() => null);
  } else {
    // New day
    state.dailyWords = generateDailyWords(state.today, state.theme, state.wordsPerDay);
    state.guesses = state.dailyWords.map(() => []);
    state.outcomes = state.dailyWords.map(() => null);
    state.currentWordIdx = 0;
    saveSession();
  }

  // Check if session is already complete
  const allDone = state.outcomes.every((o, i) => i >= state.dailyWords.length || o !== null);
  if (allDone && state.dailyWords.length > 0) {
    state.sessionComplete = true;
  }

  // Check if current word is already done (reload mid-word)
  const currentOutcome = state.outcomes[state.currentWordIdx];
  if (currentOutcome) {
    state.gameOver = true;
  }

  // Build UI
  buildBoard();
  buildKeyboard();
  applyThemeBanner();
  updateWordCounter();
  initSettings();

  // Render saved state
  const answer = state.dailyWords[state.currentWordIdx];
  if (answer) {
    renderGuesses(state.guesses[state.currentWordIdx] || [], answer);
    rebuildKeyboardState();
  }

  // If current word is done, show summary after short delay
  if (state.gameOver && !state.sessionComplete) {
    const guesses = state.guesses[state.currentWordIdx];
    setTimeout(() => {
      showSummaryModal(
        currentOutcome === "win",
        guesses.length,
        guesses[guesses.length - 1],
        answer
      );
    }, 300);
  }

  if (state.sessionComplete) {
    setTimeout(() => showSessionEndModal(), 300);
  }

  // Wire up header buttons
  $("btn-help").addEventListener("click", () => openModal(ui.helpModal()));
  $("btn-stats").addEventListener("click", () => {
    renderStatsModal();
    openModal(ui.statsModal());
  });
  $("btn-settings").addEventListener("click", () => openModal(ui.settingsModal()));

  // Wire up feedback button
  const feedbackBtn = $("btn-feedback");
  if (feedbackBtn) {
    feedbackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(FEEDBACK_URL, "_blank");
    });
  }

  // Close buttons on modals
  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      closeModal(modal);
    });
  });

  // Close modal on backdrop click
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // Next button in summary
  ui.summaryNextBtn().addEventListener("click", handleNextWord);

  // Session end close
  const seClose = $("session-end-close");
  if (seClose) seClose.addEventListener("click", () => closeAllModals());
}

document.addEventListener("DOMContentLoaded", init);
