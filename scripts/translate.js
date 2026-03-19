#!/usr/bin/env node
/**
 * translate.js - DeepL API를 이용한 Potion Crafting & Gathering 한국어 번역 자동화
 *
 * 사용법:
 *   DEEPL_API_KEY=your-key node scripts/translate.js
 *   DEEPL_API_KEY=your-key node scripts/translate.js --inspect          (DB 구조 확인)
 *   DEEPL_API_KEY=your-key node scripts/translate.js --pack ingredients  (특정 팩만)
 *
 * 특징:
 *   - 이미 번역된 항목은 건너뜀 (중단 후 재실행 가능)
 *   - HTML 태그 보존 (DeepL tag_handling=html)
 *   - 배치 처리로 API 호출 최소화
 */

import { ClassicLevel } from 'classic-level';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── 설정 ───────────────────────────────────────────────────────────────────

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const SOURCE_PACKS = 'C:/Users/HGray/Desktop/Artwork/FVTT/modules/potion-crafting-and-gathering/packs';
const OUTPUT_PATH = join(ROOT, 'languages/ko');

const PACK_CONFIG = {
  'potion-crafting-and-gathering-ingredients': { label: '포션 제작 & 수집 재료',   type: 'Item' },
  'potion-crafting-and-gathering-alchemy':     { label: '포션 제작 & 수집 연금술', type: 'Item' },
  'potion-crafting-and-gathering-herbalism':   { label: '포션 제작 & 수집 약초학', type: 'Item' },
  'potion-crafting-and-gathering-poisons':     { label: '포션 제작 & 수집 독',     type: 'Item' },
  'potion-crafting-and-gathering-journal':     { label: '포션 제작 & 수집 저널',   type: 'JournalEntry' },
  'potion-crafting-and-gathering-recipes':     { label: '포션 제작 & 수집 레시피', type: 'JournalEntry' },
  'potion-crafting-and-gathering-tables':      { label: '포션 제작 & 수집 표',     type: 'RollTable' },
};

// ─── DeepL API ───────────────────────────────────────────────────────────────

async function deeplTranslate(texts, isHtml = false) {
  const nonEmptyIndices = [];
  const nonEmptyTexts = [];
  texts.forEach((t, i) => {
    if (t && t.trim()) {
      nonEmptyIndices.push(i);
      nonEmptyTexts.push(t);
    }
  });
  if (!nonEmptyTexts.length) return [...texts];

  const params = new URLSearchParams();
  nonEmptyTexts.forEach(t => params.append('text', t));
  params.append('source_lang', 'EN');
  params.append('target_lang', 'KO');
  if (isHtml) {
    params.append('tag_handling', 'html');
    params.append('ignore_tags', 'img,br,hr');
  }

  const response = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepL API ${response.status}: ${body}`);
  }

  const data = await response.json();
  const result = [...texts];
  nonEmptyIndices.forEach((origIdx, i) => {
    result[origIdx] = data.translations[i].text;
  });
  return result;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** 배치 단위로 번역 (rate limit 방지) */
async function translateBatch(items, isHtml = false, batchSize = 30) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const translated = await deeplTranslate(batch, isHtml);
    results.push(...translated);
    if (i + batchSize < items.length) {
      process.stdout.write(`  번역 중: ${Math.min(i + batchSize, items.length)}/${items.length}\r`);
      await sleep(500);
    }
  }
  return results;
}

// ─── LevelDB 읽기 ────────────────────────────────────────────────────────────

async function readLevelDB(packPath) {
  const db = new ClassicLevel(packPath, { valueEncoding: 'json' });
  const docs = {};
  try {
    for await (const [key, value] of db.iterator()) {
      docs[key] = value;
    }
  } finally {
    await db.close();
  }
  return docs;
}

/** DB 구조 확인용 (--inspect 플래그) */
async function inspectPack(packName) {
  const packPath = join(SOURCE_PACKS, packName);
  console.log(`\n[${packName}] 키 목록:`);
  const docs = await readLevelDB(packPath);
  const keys = Object.keys(docs);
  keys.slice(0, 10).forEach(k => {
    const doc = docs[k];
    console.log(`  ${k} → name: "${doc.name || '(없음)'}", type: ${doc.type || '(없음)'}`);
  });
  if (keys.length > 10) console.log(`  ... 총 ${keys.length}개`);
}

// ─── 팩 유형별 처리 ──────────────────────────────────────────────────────────

function loadExisting(outputFile, label) {
  if (existsSync(outputFile)) {
    return JSON.parse(readFileSync(outputFile, 'utf-8'));
  }
  return { label, entries: {} };
}

function saveOutput(outputFile, label, entries) {
  const output = { label, entries };
  writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
}

/** Item 팩 처리 (ingredients, alchemy, herbalism, poisons) */
async function processItemPack(packName, config) {
  const outputFile = join(OUTPUT_PATH, `potion-crafting-and-gathering.${packName}.json`);
  const existing = loadExisting(outputFile, config.label);

  const rawDocs = await readLevelDB(join(SOURCE_PACKS, packName));

  // 최상위 문서만 (서브문서 제외)
  const newItems = [];
  for (const [key, doc] of Object.entries(rawDocs)) {
    if (!doc.name || key.includes('.')) continue;
    if (existing.entries[doc.name]) continue; // 이미 번역됨

    newItems.push({
      name: doc.name,
      description: doc.system?.description?.value || '',
    });
  }

  console.log(`  신규: ${newItems.length}개 / 기존: ${Object.keys(existing.entries).length}개`);
  if (!newItems.length) return;

  const translatedNames = await translateBatch(newItems.map(i => i.name));
  const translatedDescs = await translateBatch(newItems.map(i => i.description), true);

  const entries = { ...existing.entries };
  newItems.forEach((item, idx) => {
    entries[item.name] = {
      name: translatedNames[idx],
      ...(item.description && { description: translatedDescs[idx] }),
    };
  });

  saveOutput(outputFile, config.label, entries);
  console.log(`  저장: ${outputFile}`);
}

/** JournalEntry 팩 처리 (journal, recipes) */
async function processJournalPack(packName, config) {
  const outputFile = join(OUTPUT_PATH, `potion-crafting-and-gathering.${packName}.json`);
  const existing = loadExisting(outputFile, config.label);

  const rawDocs = await readLevelDB(join(SOURCE_PACKS, packName));

  // 저널 엔트리와 페이지 분리
  const journals = {};
  const pagesByJournal = {};

  for (const [key, doc] of Object.entries(rawDocs)) {
    if (key.includes('pages')) {
      // 페이지 서브문서: key 형식 = "!journal.pages!journalId.pageId"
      const afterPrefix = key.replace(/^!journal\.pages!/, '');
      const dotIdx = afterPrefix.indexOf('.');
      const journalId = dotIdx >= 0 ? afterPrefix.slice(0, dotIdx) : afterPrefix;
      if (!pagesByJournal[journalId]) pagesByJournal[journalId] = [];
      pagesByJournal[journalId].push(doc);
    } else {
      const id = doc._id || key.replace(/^!journal!/, '');
      journals[id] = doc;
    }
  }

  const newJournals = Object.values(journals).filter(
    j => j.name && !existing.entries[j.name]
  );

  console.log(`  신규: ${newJournals.length}개 / 기존: ${Object.keys(existing.entries).length}개`);
  if (!newJournals.length) return;

  const entries = { ...existing.entries };

  for (const journal of newJournals) {
    process.stdout.write(`  번역 중: "${journal.name}"...\n`);

    const [translatedJournalName] = await deeplTranslate([journal.name]);
    const journalPages = pagesByJournal[journal._id] || [];
    const pageEntries = {};

    for (const page of journalPages) {
      const pageName = page.name || page.title || '';
      const pageContent = page.text?.content || '';

      const [translatedPageName] = await deeplTranslate([pageName]);
      const [translatedContent] = pageContent
        ? await deeplTranslate([pageContent], true)
        : [''];

      if (pageName) {
        pageEntries[pageName] = {
          name: translatedPageName,
          ...(pageContent && { 'text.content': translatedContent }),
        };
      }
      await sleep(300);
    }

    entries[journal.name] = {
      name: translatedJournalName,
      ...(Object.keys(pageEntries).length && { pages: pageEntries }),
    };

    await sleep(300);
  }

  saveOutput(outputFile, config.label, entries);
  console.log(`  저장: ${outputFile}`);
}

/** RollTable 팩 처리 */
async function processTablePack(packName, config) {
  const outputFile = join(OUTPUT_PATH, `potion-crafting-and-gathering.${packName}.json`);
  const existing = loadExisting(outputFile, config.label);

  const rawDocs = await readLevelDB(join(SOURCE_PACKS, packName));

  const tables = {};
  const resultsByTable = {};

  for (const [key, doc] of Object.entries(rawDocs)) {
    if (key.includes('results')) {
      const afterPrefix = key.replace(/^!tables\.results!/, '');
      const dotIdx = afterPrefix.indexOf('.');
      const tableId = dotIdx >= 0 ? afterPrefix.slice(0, dotIdx) : afterPrefix;
      if (!resultsByTable[tableId]) resultsByTable[tableId] = [];
      resultsByTable[tableId].push(doc);
    } else {
      const id = doc._id || key.replace(/^!tables!/, '');
      tables[id] = doc;
    }
  }

  const newTables = Object.values(tables).filter(
    t => t.name && !existing.entries[t.name]
  );

  console.log(`  신규: ${newTables.length}개 / 기존: ${Object.keys(existing.entries).length}개`);
  if (!newTables.length) return;

  const entries = { ...existing.entries };

  for (const table of newTables) {
    process.stdout.write(`  번역 중: "${table.name}"...\n`);

    const [translatedName] = await deeplTranslate([table.name]);
    const [translatedDesc] = table.description
      ? await deeplTranslate([table.description])
      : [''];

    const tableResults = resultsByTable[table._id] || [];
    const resultTexts = tableResults.map(r => r.text || '').filter(Boolean);
    const translatedResults = resultTexts.length
      ? await translateBatch(resultTexts)
      : [];

    const resultsMap = {};
    resultTexts.forEach((text, idx) => {
      resultsMap[text] = translatedResults[idx];
    });

    entries[table.name] = {
      name: translatedName,
      ...(table.description && { description: translatedDesc }),
      ...(Object.keys(resultsMap).length && { results: resultsMap }),
    };

    await sleep(300);
  }

  saveOutput(outputFile, config.label, entries);
  console.log(`  저장: ${outputFile}`);
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isInspect = args.includes('--inspect');
  const packFilter = args.includes('--pack') ? args[args.indexOf('--pack') + 1] : null;

  if (!isInspect && !DEEPL_API_KEY) {
    console.error('오류: DEEPL_API_KEY 환경변수가 필요합니다.');
    console.error('사용법: DEEPL_API_KEY=your-key node scripts/translate.js');
    process.exit(1);
  }

  const targetPacks = Object.entries(PACK_CONFIG).filter(([name]) =>
    !packFilter || name.includes(packFilter)
  );

  if (isInspect) {
    console.log('=== DB 구조 확인 모드 ===');
    for (const [packName] of targetPacks) {
      await inspectPack(packName);
    }
    return;
  }

  console.log(`번역 시작 (총 ${targetPacks.length}개 팩)\n`);

  for (const [packName, config] of targetPacks) {
    console.log(`[${packName}]`);
    try {
      if (config.type === 'Item')         await processItemPack(packName, config);
      else if (config.type === 'JournalEntry') await processJournalPack(packName, config);
      else if (config.type === 'RollTable')    await processTablePack(packName, config);
      console.log('  완료 ✓');
    } catch (err) {
      console.error(`  실패: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }
  }

  console.log('\n전체 번역 완료!');
}

main();
