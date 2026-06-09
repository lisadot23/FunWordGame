// tips.js — Wordle strategy tips shown after a failed word (20% chance)

const WORDLE_TIPS = [
  "Try starting with words that contain common vowels like A, E, and O.",
  "CRANE, SLATE, and AUDIO are popular starter words that cover common letters.",
  "After your first guess, focus on eliminating as many letters as possible.",
  "Yellow letters ARE in the word — just not where you placed them. Try them elsewhere!",
  "Green letters are locked in. Keep them in the same position every guess.",
  "Gray letters are out completely. Don't waste guesses repeating them.",
  "Common endings like -TION, -IGHT, -OUND, and -ATCH appear in many words.",
  "Think about double letters — words like SPELL, BELLE, and FUZZY are tricky.",
  "If you have several yellows, try rearranging them in a new guess.",
  "Words often follow common patterns: consonant-vowel-consonant is very frequent.",
  "Don't forget Q, X, Z, and J — they appear in valid words more than you'd think.",
  "Common prefixes like UN-, RE-, and BE- can help you narrow down candidates.",
  "Words ending in -ER, -ED, and -LY are extremely common in English.",
  "Try to use your early guesses to test vowels: A, E, I, O, U.",
  "Sometimes working backwards helps — think of what the word could end with.",
  "The letter S appears in roughly 60% of five-letter words. It's always a safe bet.",
  "Letters T, R, and N are among the most common consonants in five-letter words.",
  "If you're stuck, think of word categories: animals, verbs, adjectives.",
  "Two-vowel words like GROVE or CRANE can reveal a lot of information quickly.",
  "Remember: you're looking for the most informative guess, not the most likely word.",
];
