import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { DocumentProcessingError } from './document-processing-errors';

export type DocumentOcrRequest = {
  content: Buffer;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  languages: readonly string[];
  maximumPages: number;
  maximumFileSize: number;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type DocumentOcrResult = {
  text: string;
  pageCount: number;
  language: string;
  provider: string;
};

export type DocumentOcrAvailability = {
  available: boolean;
  runtimeAvailable?: boolean;
  languages: readonly string[];
  pdfSupported: boolean;
};

export interface DocumentOcrProvider {
  readonly name: string;
  checkAvailability(languages: readonly string[]): Promise<DocumentOcrAvailability>;
  recognize(request: DocumentOcrRequest): Promise<DocumentOcrResult>;
}

export interface DocumentOcrService {
  checkAvailability(): Promise<DocumentOcrAvailability>;
  recognize(
    request: Omit<
      DocumentOcrRequest,
      'languages' | 'maximumPages' | 'maximumFileSize' | 'timeoutMs'
    >,
  ): Promise<DocumentOcrResult>;
}

export type DocumentOcrConfiguration = {
  driver: 'local' | 'disabled';
  languages: readonly string[];
  timeoutMs: number;
  maximumPages: number;
  maximumFileSize: number;
};

const ALLOWED_LANGUAGES = new Set(['eng', 'rus', 'lav']);

type CommandResult = { stdout: string; stderr: string };

async function runCommand(
  executable: string,
  args: readonly string[],
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      action();
    };
    const abort = () => {
      child.kill('SIGKILL');
      finish(() =>
        reject(new DocumentProcessingError('OCR_CANCELLED', true, 'OCR-обработка была отменена.')),
      );
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() =>
        reject(new DocumentProcessingError('OCR_TIMEOUT', true, 'Превышено время OCR-обработки.')),
      );
    }, options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error: NodeJS.ErrnoException) => {
      finish(() => {
        const unavailable = error.code === 'ENOENT';
        reject(
          new DocumentProcessingError(
            unavailable ? 'OCR_RUNTIME_UNAVAILABLE' : 'OCR_EXECUTION_FAILED',
            unavailable,
            unavailable ? 'OCR runtime недоступен.' : 'OCR-обработка завершилась ошибкой.',
          ),
        );
      });
    });
    child.once('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new DocumentProcessingError(
              'OCR_EXECUTION_FAILED',
              true,
              'OCR-обработка завершилась ошибкой.',
            ),
          );
          return;
        }
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        });
      });
    });
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
  });
}

function assertLanguages(languages: readonly string[]) {
  if (languages.length === 0 || languages.some((language) => !ALLOWED_LANGUAGES.has(language))) {
    throw new Error('DOCUMENT_OCR_LANGUAGES contains an unsupported language.');
  }
}

export class TesseractDocumentOcrProvider implements DocumentOcrProvider {
  readonly name = 'tesseract';

  async checkAvailability(languages: readonly string[]): Promise<DocumentOcrAvailability> {
    assertLanguages(languages);
    try {
      const version = await runCommand('tesseract', ['--version'], { timeoutMs: 5_000 });
      if (!version.stdout && !version.stderr) {
        return {
          available: false,
          runtimeAvailable: false,
          languages: [],
          pdfSupported: false,
        };
      }
      let installed: CommandResult;
      try {
        installed = await runCommand('tesseract', ['--list-langs'], { timeoutMs: 5_000 });
      } catch {
        return {
          available: false,
          runtimeAvailable: true,
          languages: [],
          pdfSupported: false,
        };
      }
      const installedLanguages = installed.stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter((value) => ALLOWED_LANGUAGES.has(value));
      let pdfSupported = false;
      try {
        await runCommand('pdftoppm', ['-v'], { timeoutMs: 5_000 });
        await runCommand('pdfinfo', ['-v'], { timeoutMs: 5_000 });
        pdfSupported = true;
      } catch {
        pdfSupported = false;
      }
      return {
        available: languages.every((language) => installedLanguages.includes(language)),
        runtimeAvailable: true,
        languages: installedLanguages,
        pdfSupported,
      };
    } catch {
      return {
        available: false,
        runtimeAvailable: false,
        languages: [],
        pdfSupported: false,
      };
    }
  }

  async recognize(request: DocumentOcrRequest): Promise<DocumentOcrResult> {
    assertLanguages(request.languages);
    if (request.content.length > request.maximumFileSize) {
      throw new DocumentProcessingError(
        'OCR_FILE_TOO_LARGE',
        false,
        'Файл превышает допустимый размер для OCR.',
      );
    }
    const directory = await mkdtemp(path.join(tmpdir(), 'avantime-ocr-'));
    try {
      const extension =
        request.mimeType === 'application/pdf'
          ? '.pdf'
          : request.mimeType === 'image/png'
            ? '.png'
            : '.jpg';
      const inputPath = path.join(directory, `input${extension}`);
      await writeFile(inputPath, request.content, { flag: 'wx', mode: 0o600 });
      let images: string[];
      if (request.mimeType === 'application/pdf') {
        const info = await runCommand('pdfinfo', [inputPath], {
          timeoutMs: Math.min(request.timeoutMs, 10_000),
          signal: request.signal,
        });
        const pages = Number(/^Pages:\s+(\d+)$/im.exec(info.stdout)?.[1] ?? 0);
        if (!Number.isSafeInteger(pages) || pages <= 0 || pages > request.maximumPages) {
          throw new DocumentProcessingError(
            'OCR_PAGE_LIMIT_EXCEEDED',
            false,
            'Документ превышает допустимое число страниц для OCR.',
          );
        }
        const prefix = path.join(directory, 'page');
        await runCommand('pdftoppm', ['-png', '-f', '1', '-l', String(pages), inputPath, prefix], {
          timeoutMs: request.timeoutMs,
          signal: request.signal,
        });
        images = (await readdir(directory))
          .filter((name) => /^page-\d+\.png$/.test(name))
          .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }))
          .map((name) => path.join(directory, name));
      } else {
        images = [inputPath];
      }

      const texts: string[] = [];
      for (const image of images) {
        const result = await runCommand(
          'tesseract',
          [image, 'stdout', '-l', request.languages.join('+'), '--psm', '3'],
          { timeoutMs: request.timeoutMs, signal: request.signal },
        );
        texts.push(result.stdout);
      }
      return {
        text: texts.join('\n\n\f\n\n'),
        pageCount: images.length,
        language: request.languages.join('+'),
        provider: this.name,
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export class DisabledDocumentOcrProvider implements DocumentOcrProvider {
  readonly name = 'disabled';
  async checkAvailability(): Promise<DocumentOcrAvailability> {
    return {
      available: false,
      runtimeAvailable: false,
      languages: [],
      pdfSupported: false,
    };
  }
  async recognize(): Promise<DocumentOcrResult> {
    throw new DocumentProcessingError('OCR_RUNTIME_UNAVAILABLE', true, 'OCR runtime недоступен.');
  }
}

export class DefaultDocumentOcrService implements DocumentOcrService {
  constructor(
    private readonly provider: DocumentOcrProvider,
    private readonly configuration: DocumentOcrConfiguration,
  ) {}

  checkAvailability() {
    return this.provider.checkAvailability(this.configuration.languages);
  }

  recognize(
    request: Omit<
      DocumentOcrRequest,
      'languages' | 'maximumPages' | 'maximumFileSize' | 'timeoutMs'
    >,
  ) {
    return this.provider.recognize({
      ...request,
      languages: this.configuration.languages,
      maximumPages: this.configuration.maximumPages,
      maximumFileSize: this.configuration.maximumFileSize,
      timeoutMs: this.configuration.timeoutMs,
    });
  }
}
