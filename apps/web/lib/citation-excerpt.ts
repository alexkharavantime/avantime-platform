export const CITATION_EXCERPT_MAXIMUM_CHARACTERS = 480;

const ELLIPSIS = '…';
const BOUNDARY_CONTEXT_CHARACTERS = 80;
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const SENTENCE_TERMINATOR = /[.!?…]/u;
const SENTENCE_CLOSER = /[»"”’')\]]/u;
const SENTENCE_OPENER = /[\p{Lu}\p{N}«"“„(\[—–-]/u;

// Abbreviations that are not treated as a sentence end even before a capital letter.
const NON_TERMINAL_ABBREVIATIONS = new Set([
  'т', 'е', 'к', 'ч', 'п', 'пп', 'ст', 'гл', 'см', 'ср', 'стр', 'рис', 'табл', 'прил', 'прим',
  'г', 'гг', 'в', 'вв', 'им', 'ул', 'д', 'напр', 'руб', 'коп', 'тыс', 'млн', 'млрд', 'шт',
  'ед', 'изм', 'кол', 'мин', 'макс', 'св', 'проф', 'акад', 'тел', 'утв', 'ред', 'изд', 'вып',
  'no', 'nr', 'vs', 'mr', 'mrs', 'ms', 'dr', 'prof', 'fig', 'eg', 'ie', 'etc', 'approx',
  'lpp', 'utt', 'piem', 'sk',
]);

export type CitationExcerptBoundaryContext = {
  // Original text immediately before the source text; '' means the document start.
  before?: string;
  // Original text immediately after the source text; '' means the document end.
  after?: string;
};

export type CitationExcerptChunk = {
  text: string;
  start?: number;
  end?: number;
};

export function citationExcerptBoundaryContext(
  fullText: string | null | undefined,
  chunk: CitationExcerptChunk,
): CitationExcerptBoundaryContext {
  if (
    typeof fullText !== 'string' ||
    !Number.isSafeInteger(chunk.start) ||
    !Number.isSafeInteger(chunk.end)
  ) {
    return {};
  }
  const start = chunk.start as number;
  const end = chunk.end as number;
  if (start < 0 || end < start || end > fullText.length) return {};
  if (fullText.slice(start, end) !== chunk.text) return {};
  return {
    before: fullText.slice(Math.max(0, start - BOUNDARY_CONTEXT_CHARACTERS), start),
    after: fullText.slice(end, end + BOUNDARY_CONTEXT_CHARACTERS),
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/gu, ' ').trim();
}

function precedingToken(text: string, index: number) {
  let start = index;
  while (start > 0 && /[\p{L}\p{N}.]/u.test(text[start - 1] ?? '')) start -= 1;
  return text.slice(start, index);
}

// Returns the exclusive sentence end when the terminator at `index` closes a sentence.
function sentenceEndAt(text: string, index: number): number | undefined {
  if (!SENTENCE_TERMINATOR.test(text[index] ?? '')) return undefined;
  let end = index;
  while (end < text.length && SENTENCE_TERMINATOR.test(text[end] ?? '')) end += 1;
  const terminatorRun = text.slice(index, end);
  while (end < text.length && SENTENCE_CLOSER.test(text[end] ?? '')) end += 1;
  if (end === text.length) return end;
  if (text[end] !== ' ') return undefined;
  const next = text[end + 1] ?? '';
  if (!SENTENCE_OPENER.test(next)) return undefined;

  const token = terminatorRun === '.' ? precedingToken(text, index) : '';
  if (token) {
    // Initials such as "А. С. Пушкин".
    if (/^\p{Lu}$/u.test(token)) return undefined;
    // List markers, numbers and versions such as "1.", "8.3." or "2.0.1.".
    if (/^[\d.]+$/u.test(token)) return undefined;
    const lastSegment = token.toLocaleLowerCase('ru').split('.').filter(Boolean).at(-1) ?? '';
    if (NON_TERMINAL_ABBREVIATIONS.has(lastSegment)) return undefined;
  }
  return end;
}

function sentenceEnds(text: string, limit: number) {
  const ends: number[] = [];
  for (let index = 0; index < Math.min(text.length, limit); index += 1) {
    const end = sentenceEndAt(text, index);
    if (end !== undefined && end <= limit) {
      ends.push(end);
      index = end - 1;
    }
  }
  return ends;
}

function startsAtSentence(text: string, before: string | undefined) {
  if (before === undefined) return SENTENCE_OPENER.test(text[0] ?? '');
  const normalizedBefore = normalizeWhitespace(before);
  if (!normalizedBefore) return true;
  if (WORD_CHARACTER.test(normalizedBefore.at(-1) ?? '') && WORD_CHARACTER.test(text[0] ?? '')) {
    return false;
  }
  const combined = `${normalizedBefore} ${text}`;
  for (let index = normalizedBefore.length - 1; index >= 0; index -= 1) {
    const character = combined[index] ?? '';
    if (SENTENCE_CLOSER.test(character)) continue;
    if (!SENTENCE_TERMINATOR.test(character)) return false;
    let runStart = index;
    while (runStart > 0 && SENTENCE_TERMINATOR.test(combined[runStart - 1] ?? '')) runStart -= 1;
    return sentenceEndAt(combined, runStart) === normalizedBefore.length;
  }
  return false;
}

function startsMidWord(text: string, before: string | undefined) {
  if (before === undefined) return /^\p{Ll}/u.test(text);
  return WORD_CHARACTER.test(before.at(-1) ?? '') && WORD_CHARACTER.test(text[0] ?? '');
}

function endsMidWord(text: string, after: string | undefined) {
  if (after === undefined) return false;
  return WORD_CHARACTER.test(after[0] ?? '') && WORD_CHARACTER.test(text.at(-1) ?? '');
}

function trimTrailingPunctuation(value: string) {
  return value.replace(/[\s,;:—–-]+$/u, '');
}

/**
 * Builds a readable, verbatim display excerpt: it starts at a sentence or word boundary,
 * ends at the last complete sentence that fits, and marks omitted text with "…".
 */
export function formatCitationExcerpt(
  text: string,
  maximumCharacters = CITATION_EXCERPT_MAXIMUM_CHARACTERS,
  context: CitationExcerptBoundaryContext = {},
) {
  const normalized = normalizeWhitespace(text);
  if (!normalized || maximumCharacters <= 0) return '';
  if (maximumCharacters <= 2) return normalized.slice(0, maximumCharacters);

  let body = normalized;
  let leadingOmission = false;
  if (!startsAtSentence(normalized, context.before)) {
    let offset = 0;
    if (startsMidWord(normalized, context.before)) {
      const space = normalized.indexOf(' ');
      offset = space === -1 ? normalized.length : space + 1;
    }
    const searchLimit = offset + Math.floor(maximumCharacters / 2);
    const nextSentence = sentenceEnds(normalized, searchLimit).find((end) => end > offset);
    if (nextSentence !== undefined && nextSentence + 1 < normalized.length) {
      offset = nextSentence + 1;
    }
    const trimmed = normalized.slice(offset).trimStart();
    if (trimmed) {
      body = trimmed;
      leadingOmission = true;
    }
  }

  const prefix = leadingOmission ? ELLIPSIS : '';
  const available = maximumCharacters - prefix.length;
  const normalizedAfter = context.after === undefined ? undefined : normalizeWhitespace(context.after);
  const scan = normalizedAfter ? `${body} ${normalizedAfter}` : body;
  const bodyEndsAtSentence = sentenceEnds(scan, body.length).at(-1) === body.length;
  if (body.length <= available && bodyEndsAtSentence) return `${prefix}${body}`;

  const lastSentenceEnd = sentenceEnds(scan, Math.min(body.length, available)).at(-1);
  if (lastSentenceEnd !== undefined && lastSentenceEnd > 0) {
    return `${prefix}${body.slice(0, lastSentenceEnd)}`;
  }

  const window = Math.min(body.length, available - ELLIPSIS.length);
  let cut = body.slice(0, window);
  if (window < body.length || endsMidWord(body, context.after)) {
    const space = cut.lastIndexOf(' ');
    if (space > 0) cut = cut.slice(0, space);
  }
  cut = trimTrailingPunctuation(cut) || body.slice(0, window);
  return `${prefix}${cut}${ELLIPSIS}`;
}
