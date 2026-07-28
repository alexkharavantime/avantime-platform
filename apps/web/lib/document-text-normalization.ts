const MAX_NORMALIZED_TEXT_CHARACTERS = 10_000_000;

export function normalizeDocumentText(text: string, maximum = MAX_NORMALIZED_TEXT_CHARACTERS) {
  return text
    .normalize('NFC')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n\f]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maximum);
}
