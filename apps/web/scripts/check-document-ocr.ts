import { loadDocumentConfiguration } from '../lib/document-configuration';
import {
  DefaultDocumentOcrService,
  DisabledDocumentOcrProvider,
  TesseractDocumentOcrProvider,
} from '../lib/document-ocr';

async function main() {
  const configuration = loadDocumentConfiguration();
  const provider =
    configuration.ocr.driver === 'local'
      ? new TesseractDocumentOcrProvider()
      : new DisabledDocumentOcrProvider();
  const service = new DefaultDocumentOcrService(provider, configuration.ocr);
  const availability = await service.checkAvailability();
  console.log(
    JSON.stringify({
      status: availability.available ? 'ready' : 'unavailable',
      languagesReady: availability.available,
      pdfReady: availability.pdfSupported,
    }),
  );
  if (!availability.available) process.exitCode = 1;
}

main().catch(() => {
  console.error('Document OCR check failed.');
  process.exitCode = 1;
});
