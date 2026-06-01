# How to Edit Your Wordle Word List

This guide explains how to add words, schedule theme days, and manage your game — no coding knowledge required.

---

## The Only File You Need to Edit

The file is called **`words.json`**. It lives in your GitHub repository alongside `index.html`.

Everything about what words appear on what day lives in this one file.

---

## How the File Is Structured

The file is a list of dates. Each date has:
- A **theme** (optional — set it to `null` for no theme, or write a name in quotes)
- A **list of 10 words** for that day

Here's what one day looks like:

```
"2026-05-14": {
    "theme": "Star Wars",
    "words": ["VADER", "LANDO", "EWOKS", "DROID", "SABER", "CLONE", "JABBA", "TROOP", "PILOT", "FORCE"]
},
```

And here's a regular day with no theme:

```
"2026-05-13": {
    "theme": null,
    "words": ["FLAME", "GROUT", "WHISK", "PLUMB", "OXIDE", "FJORD", "KNACK", "SLYLY", "TROVE", "CHIMP"]
},
```

---

## Rules to Follow (Important)

1. **All words must be exactly 5 letters.** The game will skip any word that isn't 5 letters, which will mess up the count. Double-check your words.

2. **Words must be ALL CAPS.** This is how the file is set up. Lowercase will still work but ALL CAPS is cleaner and consistent.

3. **Each day needs exactly 10 words** in the list. You can do fewer, but players will only get however many you list.

4. **Dates must be in YYYY-MM-DD format.** For example: `2026-12-25` for Christmas. Not `Dec 25` or `12/25/26`.

5. **Commas matter.** Every day except the very last one in the file must have a comma after its closing `}`. If you're not sure, just make sure you always have a comma — the game is forgiving about a trailing comma.

6. **Proper nouns are totally fine** on theme days (or any day). VADER, KENYA, SPAIN — all fine. Just make sure they're 5 letters.

---

## How to Add a New Day

### Step 1 — Go to your GitHub repository
Open github.com, sign in, and click on your Wordle repository.

### Step 2 — Open words.json
Click on the file called `words.json`.

### Step 3 — Click the pencil icon (Edit)
There's a pencil ✏️ icon near the top right of the file view. Click it.

### Step 4 — Add your new date block
Scroll to the bottom of the file. Before the very last `}` on its own line, add a comma after the previous entry (if there isn't one already), then paste in your new date block. Like this:

```
  "2026-06-01": {
    "theme": null,
    "words": ["BRISK", "CLAMP", "GRAZE", "FLUNG", "QUIRK", "STOMP", "VEXED", "WHIRL", "JOUST", "BLAZE"]
  }
```

### Step 5 — Save (Commit)
Scroll to the bottom of the edit page. You'll see a green button that says **"Commit changes"**. Click it. Done.

The game will pick up your new words automatically on that date.

---

## How to Add a Theme Day

Same as above, but fill in the theme name instead of `null`:

```
"2026-07-04": {
    "theme": "American Presidents",
    "words": ["TYLER", "GRANT", "HAYES", "TAFTS", "NIXON", "OBAMA", "TRUMP", "BIDEN", "ADAMS", "BURNS"]
},
```

The theme name will appear as a banner at the top of the game that day, so players know to expect proper nouns or a specific category.

---

## Word Ideas for Theme Days

**Countries (5-letter ones):**
SPAIN, CHINA, JAPAN, INDIA, GHANA, NIGER, TONGA, NAURU, PALAU, KENYA, CHILE, EGYPT, ITALY, HAITI, QATAR, SYRIA, SUDAN, BENIN, GABON, NEPAL, LIBYA

**Sports:**
COURT, PITCH, SCORE, MATCH, RALLY, DRAFT, PRESS, BLOCK, SERVE, STEAL, SLIDE, BULLY, REACH

**Star Wars:**
VADER, LANDO, EWOKS, DROID, SABER, CLONE, JABBA, TROOP, PILOT, FORCE, REBEL

**Holidays / Christmas:**
SANTA, CANDY, CAROL, MERRY, GIFTS, HOLLY, BELLS, ANGEL, FEAST, LIGHT, NIGHT, FROST, ELVES, CRIBS

**Note:** Always count the letters before adding a word. 5 only.

---

## Checking Your File Didn't Break

After saving, go to your GitHub Pages URL and refresh. If the game loads normally, you're good. If you see a message like "No words scheduled for today" — that's fine, it just means today's date isn't in the file yet.

If the game shows a blank screen or an error, the most likely cause is a formatting problem in `words.json`. The most common mistakes are:
- A missing comma between two date entries
- A word that isn't in quotes
- Mismatched `[` brackets or `{` braces

If that happens, go back to the file, look for the problem, and fix it. GitHub won't let you break the game permanently — you can always undo changes.

---

## Quick Template to Copy

Here's a blank template for one day. Just fill in the date, theme (or leave as `null`), and words:

```json
"YYYY-MM-DD": {
    "theme": null,
    "words": ["WORD1", "WORD2", "WORD3", "WORD4", "WORD5", "WORD6", "WORD7", "WORD8", "WORD9", "WORD10"]
},
```

---

That's everything. You now control the game entirely from this one file.
