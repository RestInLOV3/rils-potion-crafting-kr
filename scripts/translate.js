#!/usr/bin/env node
/**
 * translate.js - DeepL을 이용한 Potion Crafting & Gathering 한국어 번역 자동화
 *
 * 사용법:
 *   node scripts/translate.js                          전체 번역
 *   node scripts/translate.js --inspect                DB 구조 확인 (API 키 불필요)
 *   node scripts/translate.js --pack ingredients       특정 팩만 번역
 *
 * API 키: 모듈 루트에 SECRETS.json 파일을 만들고 아래 형식으로 저장
 *   { "DEEPL_API": "your-key-here" }
 */

import * as deepl from "deepl-node";
import { ClassicLevel } from "classic-level";
import fs from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── 설정 ───────────────────────────────────────────────────────────────────

const SOURCE_PACKS =
  "C:/Users/HGray/Desktop/Artwork/FVTT/modules/potion-crafting-and-gathering/packs";
const SOURCE_LANG =
  "C:/Users/HGray/Desktop/Artwork/FVTT/modules/potion-crafting-and-gathering/languages/en.json";
const OUTPUT_PATH = join(ROOT, "languages/ko");

const PACK_CONFIG = {
  "potion-crafting-and-gathering-ingredients": {
    label: "포션 제작 & 수집 재료",
    type: "Item",
  },
  "potion-crafting-and-gathering-alchemy": {
    label: "포션 제작 & 수집 연금술",
    type: "Item",
  },
  "potion-crafting-and-gathering-herbalism": {
    label: "포션 제작 & 수집 약초학",
    type: "Item",
  },
  "potion-crafting-and-gathering-poisons": {
    label: "포션 제작 & 수집 독",
    type: "Item",
  },
  "potion-crafting-and-gathering-journal": {
    label: "포션 제작 & 수집 저널",
    type: "JournalEntry",
  },
  "potion-crafting-and-gathering-recipes": {
    label: "포션 제작 & 수집 레시피",
    type: "JournalEntry",
  },
  "potion-crafting-and-gathering-tables": {
    label: "포션 제작 & 수집 표",
    type: "RollTable",
  },
};

// ─── API 키 로드 ─────────────────────────────────────────────────────────────

async function loadTranslator() {
  const secretsPath = join(ROOT, "SECRETS.json");
  try {
    const raw = await fs.readFile(secretsPath, "utf-8");
    const secrets = JSON.parse(raw);
    if (!secrets.DEEPL_API) throw new Error("DEEPL_API 키가 없습니다.");
    return new deepl.Translator(secrets.DEEPL_API);
  } catch (e) {
    console.error(`SECRETS.json 로드 실패: ${e.message}`);
    console.error(
      `루트 폴더에 SECRETS.json을 만들어주세요: { "DEEPL_API": "your-key" }`,
    );
    process.exit(1);
  }
}

// ─── LevelDB 읽기 ────────────────────────────────────────────────────────────

/**
 * git의 CRLF 자동변환으로 LevelDB CURRENT 파일에 \r\n이 들어가면
 * LevelDB가 'MANIFEST-xxxxx\r' 같은 잘못된 파일명을 만들어서 IO 오류가 남.
 * 읽기 전에 CURRENT 파일을 LF로 정규화한다.
 */
async function fixCurrentFile(packPath) {
  const currentPath = packPath + "/CURRENT";
  const content = await fs.readFile(currentPath, "utf-8");
  if (content.includes("\r")) {
    await fs.writeFile(currentPath, content.replaceAll("\r\n", "\n").replaceAll("\r", "\n"), "utf-8");
  }
}

async function readLevelDB(packPath) {
  // Windows에서 path.join이 역슬래시를 생성하면 LevelDB가 경로를 잘못 처리함 → 슬래시로 통일
  const normalizedPath = packPath.replaceAll("\\", "/");
  await fixCurrentFile(normalizedPath);
  const db = new ClassicLevel(normalizedPath, { valueEncoding: "json" });
  await db.open();
  const entries = await db.iterator().all();
  await db.close();
  const docs = {};
  for (const [key, value] of entries) docs[key] = value;
  return docs;
}

// ─── 번역 유틸 ───────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 텍스트 배열을 배치 번역 */
async function translateBatch(
  translator,
  texts,
  isHtml = false,
  batchSize = 30,
) {
  const results = new Array(texts.length).fill("");
  const indices = [];
  const nonEmpty = [];

  texts.forEach((t, i) => {
    if (t && t.trim()) {
      indices.push(i);
      nonEmpty.push(t);
    }
  });
  if (!nonEmpty.length) return results;

  for (let i = 0; i < nonEmpty.length; i += batchSize) {
    const batch = nonEmpty.slice(i, i + batchSize);
    const translated = await translator.translateText(batch, "en", "ko", {
      tagHandling: isHtml ? "html" : undefined,
      ignoreTags: isHtml ? ["img", "br", "hr"] : undefined,
    });
    batch.forEach((_, j) => {
      results[indices[i + j]] = translated[j].text;
    });
    if (i + batchSize < nonEmpty.length) {
      process.stdout.write(
        `  번역 중: ${Math.min(i + batchSize, nonEmpty.length)}/${nonEmpty.length}\r`,
      );
      await sleep(500);
    }
  }
  return results;
}

// ─── UI 언어 파일 번역 (ko.json) ─────────────────────────────────────────────

async function translateObjectWithCache(translator, sourceObj, targetObj) {
  if (typeof sourceObj === "string") {
    if (!sourceObj.trim()) return sourceObj;
    if (typeof targetObj === "string" && targetObj.trim()) return targetObj; // 이미 번역됨
    const [result] = await translator.translateText([sourceObj], "en", "ko");
    return result.text;
  } else if (typeof sourceObj === "object" && sourceObj !== null) {
    const out = Array.isArray(sourceObj) ? [] : {};
    for (const key of Object.keys(sourceObj)) {
      out[key] = await translateObjectWithCache(
        translator,
        sourceObj[key],
        targetObj?.[key],
      );
    }
    return out;
  }
  return sourceObj;
}

async function translateUIStrings(translator) {
  console.log("\n[ko.json] UI 문자열 번역 중...");
  const koJsonPath = join(ROOT, "languages/ko.json");

  let sourceJson;
  try {
    sourceJson = JSON.parse(await fs.readFile(SOURCE_LANG, "utf-8"));
  } catch {
    console.log("  en.json 없음, 건너뜀");
    return;
  }

  let targetJson = {};
  if (existsSync(koJsonPath)) {
    try {
      targetJson = JSON.parse(await fs.readFile(koJsonPath, "utf-8"));
    } catch {}
  }

  const translated = await translateObjectWithCache(
    translator,
    sourceJson,
    targetJson,
  );
  await fs.writeFile(koJsonPath, JSON.stringify(translated, null, 2), "utf-8");
  console.log(`  저장: ${koJsonPath}`);
}

// ─── 팩 유형별 처리 ──────────────────────────────────────────────────────────

async function loadExistingAsync(outputFile, label) {
  if (existsSync(outputFile)) {
    try {
      return JSON.parse(await fs.readFile(outputFile, "utf-8"));
    } catch {}
  }
  return { label, entries: {} };
}

async function saveOutput(outputFile, label, entries) {
  await fs.writeFile(
    outputFile,
    JSON.stringify({ label, entries }, null, 2),
    "utf-8",
  );
}

/** Item 팩 처리 */
async function processItemPack(translator, packName, config) {
  const outputFile = join(
    OUTPUT_PATH,
    `potion-crafting-and-gathering.${packName}.json`,
  );
  const existing = await loadExistingAsync(outputFile, config.label);
  const rawDocs = await readLevelDB(join(SOURCE_PACKS, packName));

  const newItems = [];
  for (const [key, doc] of Object.entries(rawDocs)) {
    if (!doc.name || key.includes(".")) continue;
    if (existing.entries[doc.name]) continue;
    newItems.push({
      name: doc.name,
      description: doc.system?.description?.value || "",
    });
  }

  console.log(
    `  신규: ${newItems.length}개 / 기존: ${Object.keys(existing.entries).length}개`,
  );
  if (!newItems.length) return;

  const translatedNames = await translateBatch(
    translator,
    newItems.map((i) => i.name),
  );
  const translatedDescs = await translateBatch(
    translator,
    newItems.map((i) => i.description),
    true,
  );

  const entries = { ...existing.entries };
  newItems.forEach((item, idx) => {
    entries[item.name] = {
      name: translatedNames[idx],
      ...(item.description && { description: translatedDescs[idx] }),
    };
  });

  await saveOutput(outputFile, config.label, entries);
  console.log(`  저장: ${outputFile}`);
}

/** JournalEntry 팩 처리 */
async function processJournalPack(translator, packName, config) {
  const outputFile = join(
    OUTPUT_PATH,
    `potion-crafting-and-gathering.${packName}.json`,
  );
  const existing = await loadExistingAsync(outputFile, config.label);
  const rawDocs = await readLevelDB(join(SOURCE_PACKS, packName));

  const journals = {};
  const pagesByJournal = {};

  for (const [key, doc] of Object.entries(rawDocs)) {
    if (key.includes("pages")) {
      const afterPrefix = key.replace(/^!journal\.pages!/, "");
      const dotIdx = afterPrefix.indexOf(".");
      const journalId =
        dotIdx >= 0 ? afterPrefix.slice(0, dotIdx) : afterPrefix;
      if (!pagesByJournal[journalId]) pagesByJournal[journalId] = [];
      pagesByJournal[journalId].push(doc);
    } else {
      const id = doc._id || key.replace(/^!journal!/, "");
      journals[id] = doc;
    }
  }

  const newJournals = Object.values(journals).filter(
    (j) => j.name && !existing.entries[j.name],
  );

  console.log(
    `  신규: ${newJournals.length}개 / 기존: ${Object.keys(existing.entries).length}개`,
  );
  if (!newJournals.length) return;

  const entries = { ...existing.entries };

  for (const journal of newJournals) {
    process.stdout.write(`  번역 중: "${journal.name}"...\n`);
    const [[translatedName]] = [
      await translator.translateText([journal.name], "en", "ko"),
    ];
    const journalPages = pagesByJournal[journal._id] || [];
    const pageEntries = {};

    for (const page of journalPages) {
      const pageName = page.name || page.title || "";
      const pageContent = page.text?.content || "";
      const [[tPageName]] = [
        await translator.translateText([pageName], "en", "ko"),
      ];
      const tContent = pageContent
        ? (
            await translator.translateText([pageContent], "en", "ko", {
              tagHandling: "html",
              ignoreTags: ["img", "br", "hr"],
            })
          )[0].text
        : "";
      if (pageName) {
        pageEntries[pageName] = {
          name: tPageName.text,
          ...(pageContent && { "text.content": tContent }),
        };
      }
      await sleep(300);
    }

    entries[journal.name] = {
      name: translatedName.text,
      ...(Object.keys(pageEntries).length && { pages: pageEntries }),
    };
    await sleep(300);
  }

  await saveOutput(outputFile, config.label, entries);
  console.log(`  저장: ${outputFile}`);
}

/** RollTable 팩 처리 */
async function processTablePack(translator, packName, config) {
  const outputFile = join(
    OUTPUT_PATH,
    `potion-crafting-and-gathering.${packName}.json`,
  );
  const existing = await loadExistingAsync(outputFile, config.label);
  const rawDocs = await readLevelDB(join(SOURCE_PACKS, packName));

  const tables = {};
  const resultsByTable = {};

  for (const [key, doc] of Object.entries(rawDocs)) {
    if (key.includes("results")) {
      const afterPrefix = key.replace(/^!tables\.results!/, "");
      const dotIdx = afterPrefix.indexOf(".");
      const tableId = dotIdx >= 0 ? afterPrefix.slice(0, dotIdx) : afterPrefix;
      if (!resultsByTable[tableId]) resultsByTable[tableId] = [];
      resultsByTable[tableId].push(doc);
    } else {
      const id = doc._id || key.replace(/^!tables!/, "");
      tables[id] = doc;
    }
  }

  const newTables = Object.values(tables).filter(
    (t) => t.name && !existing.entries[t.name],
  );

  console.log(
    `  신규: ${newTables.length}개 / 기존: ${Object.keys(existing.entries).length}개`,
  );
  if (!newTables.length) return;

  const entries = { ...existing.entries };

  for (const table of newTables) {
    process.stdout.write(`  번역 중: "${table.name}"...\n`);
    const [translatedName] = await translator.translateText(
      [table.name],
      "en",
      "ko",
    );
    const [translatedDesc] = table.description
      ? await translator.translateText([table.description], "en", "ko")
      : [{ text: "" }];

    const tableResults = resultsByTable[table._id] || [];
    const resultTexts = tableResults.map((r) => r.text || "").filter(Boolean);
    const translatedResults = resultTexts.length
      ? await translateBatch(translator, resultTexts)
      : [];

    const resultsMap = {};
    resultTexts.forEach((text, idx) => {
      resultsMap[text] = translatedResults[idx];
    });

    entries[table.name] = {
      name: translatedName.text,
      ...(table.description && { description: translatedDesc.text }),
      ...(Object.keys(resultsMap).length && { results: resultsMap }),
    };
    await sleep(300);
  }

  await saveOutput(outputFile, config.label, entries);
  console.log(`  저장: ${outputFile}`);
}

// ─── --inspect 모드 ──────────────────────────────────────────────────────────

async function inspectPack(packName) {
  const packPath = join(SOURCE_PACKS, packName);
  console.log(`\n[${packName}] 키 목록:`);
  try {
    const docs = await readLevelDB(packPath);
    const keys = Object.keys(docs);
    keys.slice(0, 10).forEach((k) => {
      const doc = docs[k];
      console.log(
        `  ${k} → name: "${doc.name || "(없음)"}", type: ${doc.type || "(없음)"}`,
      );
    });
    console.log(`  총 ${keys.length}개`);
  } catch (err) {
    console.error(`  오류: ${err.message}`);
  }
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isInspect = args.includes("--inspect");
  const packFilter = args.includes("--pack")
    ? args[args.indexOf("--pack") + 1]
    : null;

  const targetPacks = Object.entries(PACK_CONFIG).filter(
    ([name]) => !packFilter || name.includes(packFilter),
  );

  if (isInspect) {
    console.log("=== DB 구조 확인 모드 ===");
    for (const [packName] of targetPacks) await inspectPack(packName);
    return;
  }

  const translator = await loadTranslator();

  // DeepL 사용량 확인
  const usage = await translator.getUsage();
  if (usage.character) {
    const { count, limit } = usage.character;
    console.log(
      `DeepL 사용량: ${count.toLocaleString()} / ${limit.toLocaleString()} 문자`,
    );
    if (count / limit > 0.9) console.warn("⚠️  사용량 90% 초과!");
  }

  console.log(`\n번역 시작 (총 ${targetPacks.length + 1}개 항목)\n`);

  // UI 문자열 번역 (ko.json)
  await translateUIStrings(translator);

  // 컴펜디엄 번역
  for (const [packName, config] of targetPacks) {
    console.log(`\n[${packName}]`);
    try {
      if (config.type === "Item")
        await processItemPack(translator, packName, config);
      else if (config.type === "JournalEntry")
        await processJournalPack(translator, packName, config);
      else if (config.type === "RollTable")
        await processTablePack(translator, packName, config);
      console.log("  완료 ✓");
    } catch (err) {
      console.error(`  실패: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }
  }

  // 최종 사용량
  const finalUsage = await translator.getUsage();
  if (finalUsage.character) {
    const { count, limit } = finalUsage.character;
    const remaining = limit - count;
    const pct = count / limit;
    if (pct > 0.9)
      console.log(
        `\n⚠️  DeepL 사용량: ${count.toLocaleString()}/${limit.toLocaleString()} (잔여 ${remaining.toLocaleString()})`,
      );
    else
      console.log(
        `\n✅ DeepL 사용량: ${count.toLocaleString()}/${limit.toLocaleString()} (잔여 ${remaining.toLocaleString()})`,
      );
  }

  console.log("\n전체 번역 완료!");
}

main();
