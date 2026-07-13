import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toPdfDataUrl } from '../src/services/file-input.js';

describe('toPdfDataUrl', () => {
  it('formats raw PDF bytes for an OpenAI input_file item', () => {
    assert.equal(toPdfDataUrl('JVBERi0xLjQK'), 'data:application/pdf;base64,JVBERi0xLjQK');
  });
});
