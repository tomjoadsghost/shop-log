/*
 * Voice command parser: Project -> Category -> Content.
 * Pure functions, no DOM/IndexedDB access, so they're easy to test standalone.
 *
 * Recognized category words:
 *   to-do / todo / to do   -> "todo"
 *   note / notes           -> "notes"
 *   calendar / appointment / schedule -> "calendar"
 *
 * Project is matched by first name, last name, or "first last" against the
 * start of the transcript (e.g. "Simmons project, ..." or "Ellen Simmons ...").
 * If either the project or the category can't be resolved, the caller should
 * drop the raw transcript into Misc untouched (never auto-file into To-do).
 */

const CATEGORY_WORDS = {
  todo: "todo",
  "to-do": "todo",
  note: "notes",
  notes: "notes",
  calendar: "calendar",
  appointment: "calendar",
  schedule: "calendar",
  scheduled: "calendar",
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const WORD_NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

function normalizeWord(w) {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function buildNameIndex(projects) {
  const index = new Map();
  const add = (key, project) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(project);
  };
  for (const p of projects) {
    const first = normalizeWord(p.firstName || "");
    const last = normalizeWord(p.lastName || "");
    add(last, p);
    add(first, p);
    if (first && last) add(`${first} ${last}`, p);
  }
  return index;
}

function matchProjectAtStart(rawWords, index) {
  for (const len of [2, 1]) {
    if (rawWords.length < len) continue;
    const key = rawWords.slice(0, len).map(normalizeWord).join(" ");
    const matches = index.get(key);
    if (matches && matches.length === 1) {
      return { project: matches[0], restWords: rawWords.slice(len) };
    }
  }
  return null;
}

function matchCategoryAtStart(rawWords) {
  if (rawWords.length === 0) return null;

  if (rawWords.length > 1) {
    const combined = normalizeWord(rawWords[0]) + normalizeWord(rawWords[1]);
    if (combined === "todo") return { category: "todo", restWords: rawWords.slice(2) };
  }

  const w0 = normalizeWord(rawWords[0]);
  if (CATEGORY_WORDS[w0]) {
    return { category: CATEGORY_WORDS[w0], restWords: rawWords.slice(1) };
  }
  return null;
}

/** Extracts a "remind me N days before" / "remind me the day before" clause. */
function extractReminderOffset(text) {
  let match = text.match(/\bremind(?:er)?\s*(?:me\s*)?(\d+)\s*days?\s+before\b/i);
  if (match) {
    return { reminderOffsetDays: Number(match[1]), remainder: text.replace(match[0], " ") };
  }
  match = text.match(/\bremind(?:er)?\s*(?:me\s*)?(?:(the|a|an|one|two|three|four|five|six|seven)\s+)?days?\s+before\b/i);
  if (match) {
    const word = (match[1] || "one").toLowerCase();
    const n = word === "the" ? 1 : WORD_NUMBERS[word] || 1;
    return { reminderOffsetDays: n, remainder: text.replace(match[0], " ") };
  }
  return { reminderOffsetDays: null, remainder: text };
}

function nextWeekday(base, targetDow, forceNextWeek) {
  const d = new Date(base);
  let diff = (targetDow - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  if (forceNextWeek) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Extracts a calendar date from free text. Returns {date: Date|null, remainder}. */
function extractDate(text, now) {
  const base = now || new Date();

  let match = text.match(/\b(?:on\s+)?today\b/i);
  if (match) {
    return { date: new Date(base), remainder: text.replace(match[0], " ") };
  }

  match = text.match(/\b(?:on\s+)?tomorrow\b/i);
  if (match) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return { date: d, remainder: text.replace(match[0], " ") };
  }

  match = text.match(/\b(?:on\s+)?(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (match) {
    const dow = WEEKDAYS.indexOf(match[2].toLowerCase());
    const d = nextWeekday(base, dow, Boolean(match[1]));
    return { date: d, remainder: text.replace(match[0], " ") };
  }

  match = text.match(
    /\b(?:on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (match) {
    const month = MONTHS.indexOf(match[1].toLowerCase());
    const day = Number(match[2]);
    const d = new Date(base.getFullYear(), month, day);
    if (d < base) d.setFullYear(d.getFullYear() + 1);
    return { date: d, remainder: text.replace(match[0], " ") };
  }

  match = text.match(/\b(?:on\s+)?(\d{1,2})[\/\-](\d{1,2})\b/);
  if (match) {
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const d = new Date(base.getFullYear(), month, day);
    if (d < base) d.setFullYear(d.getFullYear() + 1);
    return { date: d, remainder: text.replace(match[0], " ") };
  }

  match = text.match(/\bin\s+(\d+)\s+days?\b/i);
  if (match) {
    const d = new Date(base);
    d.setDate(d.getDate() + Number(match[1]));
    return { date: d, remainder: text.replace(match[0], " ") };
  }

  return { date: null, remainder: text };
}

/** Extracts a time-of-day from free text. Returns {hours, minutes}|null and remainder. */
function extractTime(text) {
  let match = text.match(/\b(?:at\s+)?noon\b/i);
  if (match) return { hours: 12, minutes: 0, remainder: text.replace(match[0], " ") };

  match = text.match(/\b(?:at\s+)?midnight\b/i);
  if (match) return { hours: 0, minutes: 0, remainder: text.replace(match[0], " ") };

  match = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (match) {
    let hours = Number(match[1]) % 12;
    if (match[3].toLowerCase() === "pm") hours += 12;
    return { hours, minutes: Number(match[2] || 0), remainder: text.replace(match[0], " ") };
  }

  match = text.match(/\b(?:at\s+)?(\d{1,2})\s*o'?clock\b/i);
  if (match) {
    let hours = Number(match[1]) % 12;
    if (hours >= 1 && hours <= 6) hours += 12;
    return { hours, minutes: 0, remainder: text.replace(match[0], " ") };
  }

  return { hours: null, minutes: null, remainder: text };
}

function cleanupText(text) {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
}

/** Parses the calendar-specific content: date, time, reminder offset, and a leftover title. */
function parseCalendarContent(content, now) {
  const reminder = extractReminderOffset(content);
  const dateResult = extractDate(reminder.remainder, now);
  const timeResult = extractTime(dateResult.remainder);

  let date = null;
  if (dateResult.date) {
    date = new Date(dateResult.date);
    date.setHours(timeResult.hours ?? 9, timeResult.minutes ?? 0, 0, 0);
  }

  const title = cleanupText(timeResult.remainder) || "Calendar entry";

  return {
    date: date ? date.toISOString() : null,
    reminderOffsetDays: reminder.reminderOffsetDays,
    text: title,
  };
}

/**
 * Parses a raw voice transcript against the Project -> Category -> Content structure.
 * `projects` is the list of known projects (any status) to match against.
 * `now` (optional Date) lets calendar parsing be deterministic in tests.
 */
function parseTranscript(rawText, projects, now) {
  const text = (rawText || "").trim();
  if (!text) return { recognized: false, rawText: text };

  const words = text.split(/\s+/).filter(Boolean);
  const nameIndex = buildNameIndex(projects);

  const nameMatch = matchProjectAtStart(words, nameIndex);
  if (!nameMatch) return { recognized: false, rawText: text };

  let restWords = nameMatch.restWords;
  if (restWords.length && normalizeWord(restWords[0]) === "project") {
    restWords = restWords.slice(1);
  }

  const catMatch = matchCategoryAtStart(restWords);
  if (!catMatch) return { recognized: false, rawText: text };

  const content = cleanupText(catMatch.restWords.join(" "));
  if (!content) return { recognized: false, rawText: text };

  const result = {
    recognized: true,
    rawText: text,
    project: nameMatch.project,
    category: catMatch.category,
  };

  if (catMatch.category === "calendar") {
    Object.assign(result, parseCalendarContent(content, now));
  } else {
    result.text = content;
  }

  return result;
}
