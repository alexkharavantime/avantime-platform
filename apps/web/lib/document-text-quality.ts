export type DocumentTextQualityReason =
  | 'SUFFICIENT'
  | 'EMPTY'
  | 'TOO_SHORT'
  | 'LOW_PRINTABLE_RATIO'
  | 'LOW_ALPHANUMERIC_RATIO'
  | 'REPEATED_GARBAGE'
  | 'INVALID_UNICODE'
  | 'POOR_PAGE_DISTRIBUTION';

export type DocumentTextQualityAssessment = {
  text: string | null | undefined;
  pageCount?: number;
  pageTexts?: readonly string[];
};

export type DocumentTextQualityResult = {
  sufficient: boolean;
  requiresOcr: boolean;
  requiresManualReview: boolean;
  reason: DocumentTextQualityReason;
  characterCount: number;
  printableRatio: number;
  alphanumericRatio: number;
};

export interface DocumentTextQualityService {
  assess(input: DocumentTextQualityAssessment): DocumentTextQualityResult;
}

export type DocumentTextQualityConfiguration = {
  minimumCharacters: number;
  minimumPrintableRatio: number;
  minimumAlphanumericRatio: number;
};

export class DefaultDocumentTextQualityService implements DocumentTextQualityService {
  constructor(private readonly configuration: DocumentTextQualityConfiguration) {}

  assess(input: DocumentTextQualityAssessment): DocumentTextQualityResult {
    const text = input.text ?? '';
    const characters = [...text];
    const count = characters.length;
    const printable = characters.filter(
      (character) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(character),
    ).length;
    const alphanumeric = characters.filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
    const printableRatio = count === 0 ? 0 : printable / count;
    const alphanumericRatio = count === 0 ? 0 : alphanumeric / count;
    const invalidUnicode = text.includes('\uFFFD') || text.includes('\0');
    const repeatedGarbage = /([^\p{L}\p{N}\s])\1{12,}/u.test(text);
    const pages = input.pageTexts?.map((page) => page.trim().length) ?? [];
    const poorDistribution =
      (input.pageCount ?? pages.length) > 1 &&
      pages.length > 1 &&
      pages.filter((length) => length === 0).length > Math.floor(pages.length / 2);

    let reason: DocumentTextQualityReason = 'SUFFICIENT';
    if (!text.trim()) reason = 'EMPTY';
    else if (count < this.configuration.minimumCharacters) reason = 'TOO_SHORT';
    else if (invalidUnicode) reason = 'INVALID_UNICODE';
    else if (repeatedGarbage) reason = 'REPEATED_GARBAGE';
    else if (printableRatio < this.configuration.minimumPrintableRatio) {
      reason = 'LOW_PRINTABLE_RATIO';
    } else if (alphanumericRatio < this.configuration.minimumAlphanumericRatio) {
      reason = 'LOW_ALPHANUMERIC_RATIO';
    } else if (poorDistribution) reason = 'POOR_PAGE_DISTRIBUTION';

    const sufficient = reason === 'SUFFICIENT';
    return {
      sufficient,
      requiresOcr: !sufficient,
      requiresManualReview: !sufficient,
      reason,
      characterCount: count,
      printableRatio,
      alphanumericRatio,
    };
  }
}
