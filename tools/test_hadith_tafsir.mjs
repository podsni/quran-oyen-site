import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLLECTIONS,
  MAX_SAVED_HADITH,
  buildFawazHadithUrl,
  createIlmFeatures,
  hadithScopeLabel,
  normalizeSavedHadith,
  normalizeSearchText,
  savedHadithKey,
  searchIndonesianHadith,
  validateSavedHadithList,
  validateFawazCorpus,
  validateFawazHadith,
  validateGlobalHadithSearch,
  validateHadithDetail,
} from '../hadith-tafsir.js';

test('defines ten supported collections and only seven Indonesian editions', () => {
  assert.equal(COLLECTIONS.length, 10);
  assert.deepEqual(COLLECTIONS.filter((item) => item.indonesian).map((item) => item.key), [
    'bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik',
  ]);
});

test('builds only pinned, allowlisted CDN edition URLs', () => {
  assert.equal(
    buildFawazHadithUrl('ind', 'bukhari', 1),
    'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ind-bukhari/1.min.json',
  );
  assert.equal(
    buildFawazHadithUrl('ara', 'qudsi'),
    'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-qudsi.min.json',
  );
  assert.throws(() => buildFawazHadithUrl('en', 'bukhari', 1), RangeError);
  assert.throws(() => buildFawazHadithUrl('ind', 'qudsi', 1), RangeError);
  assert.throws(() => buildFawazHadithUrl('ara', 'unknown', 1), RangeError);
});

test('validates UmmahAPI hadith detail and rejects mismatched references', () => {
  const payload = {
    success: true,
    service: 'hadith',
    data: { collection: 'bukhari', collection_name: 'Sahih al-Bukhari', hadithnumber: 1, arabic: 'عَرَبِيّ', english: 'English text', grade: 'Sahih' },
  };
  const data = validateHadithDetail(payload, 'bukhari', 1);
  assert.equal(data.number, '1');
  assert.equal(data.collectionName, 'Sahih al-Bukhari');
  assert.equal(data.arabic, 'عَرَبِيّ');
  assert.equal(data.grade, 'Sahih');
  assert.throws(() => validateHadithDetail(payload, 'muslim', 1), /does not match/);
  assert.throws(() => validateHadithDetail({ success: true, data: {} }, 'bukhari', 1));
});

test('validates full-text global search response and ignores malformed results', () => {
  const data = validateGlobalHadithSearch({
    success: true,
    service: 'hadith-search',
    data: {
      hadiths: [
        { collection: 'bukhari', hadithnumber: 1, arabic: 'عربي', english: 'Text' },
        { collection: 'muslim', hadithnumber: 2, english: 'Other text' },
        { collection: 'invalid' },
        { collection: 'bukhari', hadithnumber: 0, english: 'Invalid reference' },
      ],
    },
  });
  assert.equal(data.length, 2);
  assert.throws(() => validateGlobalHadithSearch({ success: true, service: 'hadith', data: { hadiths: [] } }));
});

test('validates an individual Fawaz edition response by hadith number', () => {
  const payload = {
    metadata: { name: 'Sahih al Bukhari' },
    hadiths: [{ hadithnumber: 1, arabicnumber: 1, text: 'Semua perbuatan tergantung niatnya', grades: [] }],
  };
  assert.equal(validateFawazHadith(payload, 1).hadith.text, 'Semua perbuatan tergantung niatnya');
  assert.throws(() => validateFawazHadith(payload, 2), /not found/);
});

test('validates a corpus and searches every Indonesian token without case sensitivity', () => {
  const corpus = validateFawazCorpus({
    metadata: { name: 'Sahih al Bukhari' },
    hadiths: [
      { hadithnumber: 1, text: 'Telah menceritakan tentang semua perbuatan dan niatnya' },
      { hadithnumber: 2, text: 'Tentang sedekah dan kebaikan' },
      { hadithnumber: 3, text: 'Sabar saat menghadapi ujian' },
    ],
  });
  const results = searchIndonesianHadith(corpus, 'PERBUATAN niatnya');
  assert.equal(results.total, 1);
  assert.equal(results.items[0].hadithnumber, 1);
  assert.equal(searchIndonesianHadith(corpus, '999').total, 0);
  assert.equal(searchIndonesianHadith(corpus, '3').items[0].hadithnumber, 3);
});

test('normalizes Arabic diacritics and punctuation for local matching', () => {
  assert.equal(normalizeSearchText('رَسُولُ اللَّهِ،'), 'رسول الله');
});

test('normalizes saved hadith references to trusted collection metadata', () => {
  const saved = normalizeSavedHadith({ collection: 'bukhari', number: '1', collectionName: 'Forged name', indonesian: 'Niat', savedAt: 123 });
  assert.deepEqual(saved, {
    collection: 'bukhari', collectionName: 'Sahih al-Bukhari', number: '1',
    arabic: '', indonesian: 'Niat', english: '', grade: '', savedAt: 123,
  });
  assert.equal(savedHadithKey(saved), 'bukhari:1');
  assert.equal(normalizeSavedHadith({ collection: 'unknown', number: 1 }), null);
  assert.equal(normalizeSavedHadith({ collection: 'bukhari', number: 0 }), null);
  assert.equal(normalizeSavedHadith({ collection: 'bukhari', number: 1, english: 7 }), null);
  assert.equal(normalizeSavedHadith({ collection: 'bukhari', number: 1, english: 'x'.repeat(30001) }), null);
});

test('filters duplicate saved references and caps the local list at fifty', () => {
  const items = Array.from({ length: MAX_SAVED_HADITH + 4 }, (_, index) => ({ collection: 'bukhari', number: index + 1, indonesian: `Teks ${index + 1}` }));
  const list = validateSavedHadithList([items[0], { ...items[0], indonesian: 'duplikat' }, ...items]);
  assert.equal(list.length, MAX_SAVED_HADITH);
  assert.equal(list[0].indonesian, 'Teks 1');
  assert.deepEqual(validateSavedHadithList({}), []);
});

test('old PWA HTML without the new panel does not crash reader initialization', () => {
  const original = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    assert.equal(createIlmFeatures({ sheets: { own() { throw new Error('must not register'); } } }), null);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});

test('scope labels follow option values rather than option order', () => {
  assert.equal(hadithScopeLabel('indonesian'), 'Kitab terpilih · terjemahan Indonesia');
  assert.equal(hadithScopeLabel('global'), 'Semua kitab · teks Inggris');
  assert.match(hadithScopeLabel('global', 'en'), /English/);
  assert.match(hadithScopeLabel('indonesian', 'en'), /Indonesian/);
});
