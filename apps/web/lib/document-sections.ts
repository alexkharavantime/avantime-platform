// Numbered section headings ("31.2 ИЗГОТОВЛЕНИЕ …", "31.2.4. Возврат материалов …") carried
// from earlier chunks, so a chunk keeps the context of the section it belongs to.
// Parts with a leading zero ("10.01") are account codes, and a number right after a word
// ("Редакция 1.3" in running headers) is a version, not a section number.
const HEADING =
  /(?:^|[\s.])(?<![\p{L}]\s)((?:[1-9]\d{0,2})(?:\.(?:[1-9]\d{0,2})){1,3})\.?\s+([А-ЯЁA-Z][^.!?\n]{2,90}?)(?=\s+[А-ЯЁA-Z](?:[а-яёa-z]|\s)|[.!?]|$)/gu;

type SectionChunk = { id: string; index: number; text: string };

export function sectionLabelsForChunks(chunks: readonly SectionChunk[]) {
  const labels = new Map<string, string>();
  // Active heading per depth: depth 2 is "31.2", depth 3 is "31.2.4".
  const active: string[] = [];
  for (const chunk of [...chunks].sort((first, second) => first.index - second.index)) {
    const atStart = active.filter(Boolean);
    const inside: string[] = [];
    for (const match of chunk.text.replace(/\s+/gu, ' ').matchAll(HEADING)) {
      const number = match[1]!;
      const heading = `${number} ${match[2]!.trim()}`;
      const depth = number.split('.').length;
      active[depth] = heading;
      active.length = depth + 1;
      inside.push(heading);
    }
    const parts = [...atStart, ...inside.filter((heading) => !atStart.includes(heading))];
    if (parts.length > 0) labels.set(chunk.id, parts.join(' › '));
  }
  return labels;
}
