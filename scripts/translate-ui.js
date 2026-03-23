#!/usr/bin/env node
/**
 * translate-ui.js - DeepL을 이용한 FVTT 모듈 UI 문자열 한국어 번역
 *
 * 사용법:
 *   node scripts/translate-ui.js                   mastercrafted + gatherer 전체 번역
 *   node scripts/translate-ui.js --module mastercrafted   특정 모듈만 번역
 *   node scripts/translate-ui.js --module gatherer
 *
 * API 키: 이 모듈 루트의 SECRETS.json에서 읽음
 *   { "DEEPL_API": "your-key-here" }
 */

import * as deepl from "deepl-node";
import fs from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── 대상 모듈 설정 ──────────────────────────────────────────────────────────

const MODULES = {
  mastercrafted: {
    name: "Mastercrafted",
    base: "C:/Users/HGray/Desktop/Artwork/FVTT/modules/mastercrafted",
    src: "languages/en.json",
    out: "languages/ko.json",
  },
  gatherer: {
    name: "Gatherer",
    base: "C:/Users/HGray/Desktop/Artwork/FVTT/modules/gatherer",
    src: "languages/en.json",
    out: "languages/ko.json",
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
    process.exit(1);
  }
}

// ─── 번역 유틸 ───────────────────────────────────────────────────────────────

/**
 * JSON 객체를 재귀적으로 번역. 기존 번역이 있으면 건너뜀.
 */
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

// ─── 모듈 번역 ───────────────────────────────────────────────────────────────

async function translateModule(translator, moduleKey, config) {
  console.log(`\n[${config.name}] UI 번역 시작...`);

  const srcPath = `${config.base}/${config.src}`;
  const outPath = `${config.base}/${config.out}`;

  let source;
  try {
    source = JSON.parse(await fs.readFile(srcPath, "utf-8"));
  } catch (e) {
    console.error(`  en.json 읽기 실패: ${e.message}`);
    return;
  }

  let existing = {};
  if (existsSync(outPath)) {
    try {
      existing = JSON.parse(await fs.readFile(outPath, "utf-8"));
      console.log(`  기존 ko.json 로드됨 (캐시 활용)`);
    } catch {}
  }

  const translated = await translateObjectWithCache(translator, source, existing);
  await fs.writeFile(outPath, JSON.stringify(translated, null, 4), "utf-8");
  console.log(`  저장 완료: ${outPath}`);
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const moduleFilter = args.includes("--module")
    ? args[args.indexOf("--module") + 1]
    : null;

  const targets = Object.entries(MODULES).filter(
    ([key]) => !moduleFilter || key === moduleFilter,
  );

  if (!targets.length) {
    console.error(`알 수 없는 모듈: ${moduleFilter}`);
    console.error(`사용 가능: ${Object.keys(MODULES).join(", ")}`);
    process.exit(1);
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

  for (const [key, config] of targets) {
    try {
      await translateModule(translator, key, config);
      console.log(`  [${config.name}] 완료 ✓`);
    } catch (err) {
      console.error(`  [${config.name}] 실패: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }
  }

  // 최종 사용량
  const finalUsage = await translator.getUsage();
  if (finalUsage.character) {
    const { count, limit } = finalUsage.character;
    const remaining = limit - count;
    const pct = count / limit;
    const icon = pct > 0.9 ? "⚠️ " : "✅";
    console.log(
      `\n${icon} DeepL 사용량: ${count.toLocaleString()}/${limit.toLocaleString()} (잔여 ${remaining.toLocaleString()})`,
    );
  }

  console.log("\n번역 완료!");
}

main();
