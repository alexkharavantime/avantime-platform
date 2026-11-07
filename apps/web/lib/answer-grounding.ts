// Offline grounding checks for generated knowledge answers: named documents must appear in the
// sources a statement cites, and a statement must not rely on sources from another scenario.

export type GroundingSource = {
  sourceId: string;
  text: string;
  // Scenario or party perspective the source describes; undefined when it is neutral.
  scenario?: string;
};

export type GroundingIssue =
  | {
      kind: 'unsupported_name';
      statement: string;
      name: string;
      citedSourceIds: string[];
    }
  | {
      kind: 'scenario_mismatch';
      statement: string;
      expectedScenario: string;
      citedScenarios: string[];
      citedSourceIds: string[];
    };

function normalize(value: string) {
  return value.replace(/\s+/gu, ' ').replace(/ё/gu, 'е').toLocaleLowerCase('ru').trim();
}

const DOCUMENT_NAME = /документ(?:ом|а|ы|ов|ами|ах)?\s+(?:универсального назначения\s+)?[«"]?([А-ЯЁ][а-яё]+(?:-[а-яё]+)?(?:\s+(?:[а-яё]+(?:-[а-яё]+)?)){0,4}?)[»"]?(?=\s*(?:\(|,|\.|;|:|$|\s+с\s+видом|\s+[–-]\s|\s+\())/gu;

// Words that start an ordinary sentence after "документ…" rather than a document name.
const SENTENCE_STARTERS = new Set(['но', 'и', 'а', 'это', 'если', 'при', 'как', 'так', 'то', 'он', 'она', 'они']);

// Document names as the sources introduce them ("документом Передача товаров (…)").
export function extractDocumentNames(texts: readonly string[]) {
  const names = new Set<string>();
  for (const text of texts) {
    for (const match of text.replace(/\s+/gu, ' ').matchAll(DOCUMENT_NAME)) {
      const name = match[1]?.trim();
      if (!name || name.split(' ').length < 2) continue;
      if (SENTENCE_STARTERS.has(normalize(name.split(' ')[0]!))) continue;
      names.add(name);
    }
  }
  return [...names].sort();
}

// A statement is a paragraph or list item together with the citation markers it carries.
function statements(answer: string) {
  return answer
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      text: line,
      sourceIds: [...new Set([...line.matchAll(/\[(S\d+)\]/gu)].map((match) => match[1]!))],
    }))
    .filter((statement) => statement.sourceIds.length > 0);
}

export function checkAnswerGrounding(input: {
  answer: string;
  sources: readonly GroundingSource[];
  documentNames: readonly string[];
  expectedScenario?: string;
}): GroundingIssue[] {
  const sources = new Map(input.sources.map((source) => [source.sourceId, source]));
  const issues: GroundingIssue[] = [];
  for (const statement of statements(input.answer)) {
    const cited = statement.sourceIds
      .map((sourceId) => sources.get(sourceId))
      .filter((source): source is GroundingSource => Boolean(source));
    const statementText = normalize(statement.text);
    for (const name of input.documentNames) {
      if (!statementText.includes(normalize(name))) continue;
      if (!cited.some((source) => normalize(source.text).includes(normalize(name)))) {
        issues.push({
          kind: 'unsupported_name',
          statement: statement.text,
          name,
          citedSourceIds: statement.sourceIds,
        });
      }
    }
    if (input.expectedScenario) {
      const citedScenarios = [
        ...new Set(cited.map((source) => source.scenario).filter((scenario) => scenario !== undefined)),
      ] as string[];
      if (citedScenarios.some((scenario) => scenario !== input.expectedScenario)) {
        issues.push({
          kind: 'scenario_mismatch',
          statement: statement.text,
          expectedScenario: input.expectedScenario,
          citedScenarios,
          citedSourceIds: statement.sourceIds,
        });
      }
    }
  }
  return issues;
}
