import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdfBytes, STARTER_BOOKS } from './samplePdf';

test('buildPdfBytes generates valid PDF 1.4 structure with xref and EOF', () => {
  const spec = STARTER_BOOKS[0];
  const bytes = buildPdfBytes(spec);
  const text = new TextDecoder('latin1').decode(bytes);

  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.includes(`/Count ${spec.pages.length}`));
  assert.ok(text.includes('xref\n'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.ok(bytes.byteLength > 1000);
});
