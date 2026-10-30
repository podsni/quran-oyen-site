import assert from 'node:assert/strict';
import test from 'node:test';
import {
  audioForQari,
  getEquranSurah,
  getEquranTafsir,
  QARIS,
  unwrapResponse,
  validateAudioUrl,
  validateSurahDetail,
  validateSurahList,
  validateTafsir,
} from '../equran.js';

const validAudio = 'https://cdn.equran.id/audio-partial/Abdullah-Al-Juhany/001001.mp3';

test('accepts the documented success wrapper and rejects API errors', () => {
  assert.deepEqual(unwrapResponse({ code: 200, message: 'ok', data: [1] }), [1]);
  assert.throws(() => unwrapResponse({ code: 500, message: 'no', data: null }), /no/);
});

test('allows only HTTPS MP3 links from the EQuran CDN', () => {
  assert.equal(validateAudioUrl(validAudio), validAudio);
  assert.equal(validateAudioUrl('http://cdn.equran.id/audio-full/a/001.mp3'), null);
  assert.equal(validateAudioUrl('https://evil.example/audio-full/a/001.mp3'), null);
  assert.equal(validateAudioUrl('https://cdn.equran.id/audio-full/a/001.mp3?x=1'), 'https://cdn.equran.id/audio-full/a/001.mp3?x=1');
});

test('exposes the six supported reciters and validates audio map keys', () => {
  assert.equal(QARIS.length, 6);
  assert.equal(audioForQari({ '01': validAudio }, '01'), validAudio);
  assert.equal(audioForQari({ '07': validAudio }, '07'), null);
});

test('validates the complete 114-surah catalog in order', () => {
  const catalog = Array.from({ length: 114 }, (_, i) => ({ nomor: i + 1, namaLatin: `Surah ${i + 1}`, jumlahAyat: 1 }));
  assert.equal(validateSurahList(catalog), catalog);
  assert.throws(() => validateSurahList(catalog.slice(1)), /tidak lengkap/);
  assert.throws(() => validateSurahList([{ ...catalog[0], nomor: 2 }, ...catalog.slice(1)]), /tidak valid/);
});

test('validates detail and tafsir schemas', () => {
  const detail = { nomor: 1, jumlahAyat: 1, ayat: [{ nomorAyat: 1, audio: { '01': validAudio } }] };
  assert.equal(validateSurahDetail(detail, 1), detail);
  assert.throws(() => validateSurahDetail({ ...detail, ayat: [] }, 1), /tidak lengkap/);
  const tafsir = { nomor: 1, tafsir: [{ ayat: 1, teks: '<script>not executed</script>' }] };
  assert.equal(validateTafsir(tafsir, 1), tafsir);
  assert.throws(() => validateTafsir({ ...tafsir, tafsir: [] }, 1), /tidak tersedia/);
});

test('rejects invalid surah numbers before making a request', async () => {
  await assert.rejects(getEquranSurah(0), RangeError);
  await assert.rejects(getEquranTafsir(115), RangeError);
});
