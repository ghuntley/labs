// Unit tests for ArtLogic, extracted from the piece HTML: `node --test tests/art/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const artDir = join(root, 'srv/art');
const epochs = readdirSync(artDir).filter((n) => /^\d+$/.test(n)).sort();
assert.ok(epochs.length, 'no srv/art/<epoch>/ pieces');
const htmlPath = join(artDir, epochs[epochs.length - 1], 'index.html');
const html = readFileSync(htmlPath, 'utf8');

const match = html.match(/<script id="art-logic">([\s\S]*?)<\/script>/);
assert.ok(match, 'art-logic script missing from ' + htmlPath);
const L = new Function(`${match[1]}; return ArtLogic;`)();
assert.ok(L, 'ArtLogic was not defined');

test('parseSeed accepts decimals, hex, and hashed strings', () => {
  assert.deepEqual(L.parseSeed(''), { ok: false, display: '', value: 0 });
  assert.deepEqual(L.parseSeed('  42  '), { ok: true, display: '42', value: 42 });
  assert.equal(L.parseSeed('0x10').value, 16);
  assert.equal(L.parseSeed('0xff').ok, true);
  assert.equal(L.parseSeed('4294967295').value, 4294967295);
  const hashed = L.parseSeed('pearl-acid');
  assert.equal(hashed.ok, true);
  assert.equal(hashed.display, 'pearl-acid');
  assert.equal(hashed.value, L.hash32('pearl-acid'));
  assert.equal(L.parseSeed('pearl-acid').value, hashed.value);
});

test('hash32 is a stable uint32', () => {
  const a = L.hash32('thin film');
  const b = L.hash32('thin film');
  const c = L.hash32('thin-film');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a, a >>> 0);
});

test('clamp rejects non-finite and stays in range', () => {
  assert.equal(L.clamp(5, 0, 10), 5);
  assert.equal(L.clamp(-1, 0, 10), 0);
  assert.equal(L.clamp(99, 0, 10), 10);
  assert.equal(L.clamp(NaN, 0, 10), 0);
  assert.equal(L.clamp(Infinity, 0, 10), 10);
});

test('same seed builds the same 16-step acid pattern', () => {
  const a = L.buildAcidPattern(1795745782);
  const b = L.buildAcidPattern(1795745782);
  const c = L.buildAcidPattern(1795745783);
  assert.equal(a.steps.length, 16);
  assert.equal(a.steps[0].rest, false);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.steps, c.steps);
  for (const st of a.steps) {
    assert.equal(typeof st.note, 'number');
    assert.ok(Number.isFinite(st.note));
    assert.equal(typeof st.accent, 'boolean');
    assert.equal(typeof st.slide, 'boolean');
  }
});

test('midiToFreq(69) is 440 and doubles each octave', () => {
  assert.ok(Math.abs(L.midiToFreq(69) - 440) < 1e-9);
  assert.ok(Math.abs(L.midiToFreq(81) / L.midiToFreq(69) - 2) < 1e-9);
});

test('readSeedFromLocation prefers #seed= over ?seed=', () => {
  const fromHash = L.readSeedFromLocation({ hash: '#seed=99', search: '?seed=1' });
  assert.equal(fromHash.value, 99);
  const fromQuery = L.readSeedFromLocation({ hash: '', search: '?seed=abc' });
  assert.equal(fromQuery.display, 'abc');
  assert.equal(fromQuery.value, L.hash32('abc'));
  assert.equal(L.readSeedFromLocation({ hash: '', search: '' }), null);
});

test('seedHashString encodes the display form', () => {
  assert.equal(L.seedHashString('42'), '#seed=42');
  assert.equal(L.seedHashString('pearl acid'), '#seed=pearl%20acid');
});

test('the piece HTML has no external network dependencies', () => {
  assert.equal(/\s(src|href)\s*=\s*["']https?:/i.test(html), false);
  assert.equal(/\s(src|href)\s*=\s*["']\/\//.test(html), false);
  assert.equal(/cdn\.|unpkg|jsdelivr|skypack|esm\.sh/i.test(html), false);
});
