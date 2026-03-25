"""
sync_descriptions.py
레시피 번역 파일의 text 필드를
연금술/약초학/독/재료 번역 파일의 description과 동기화한다.

사용법:
    python sync_descriptions.py          # 실제 적용
    python sync_descriptions.py --dry-run  # 변경 내역만 출력, 파일 수정 없음

이름이 완전히 일치하지 않는 경우, MANUAL_MAP 딕셔너리에
"레시피 페이지 이름": "아이템 파일 항목 이름" 형태로 수동 매핑을 추가한다.
"""

import argparse
import json
import re
import sys
from pathlib import Path

LANG_DIR = Path(__file__).parent / "languages" / "ko"
PREFIX = "potion-crafting-and-gathering.potion-crafting-and-gathering"

SOURCE_FILES = {
    "alchemy":   LANG_DIR / f"{PREFIX}-alchemy.json",
    "herbalism": LANG_DIR / f"{PREFIX}-herbalism.json",
    "poisons":   LANG_DIR / f"{PREFIX}-poisons.json",
    "ingredients": LANG_DIR / f"{PREFIX}-ingredients.json",
}
RECIPES_FILE = LANG_DIR / f"{PREFIX}-recipes.json"

# 자동 매칭으로 못 찾는 경우의 수동 매핑
# "레시피 페이지 이름": "아이템 파일 항목 이름"
MANUAL_MAP = {
    "Alchemist's Fire":       "Alchemist's Fire (flask)",
    "Ink":                    "Ink (5 ounce bottle)",
    "Potion of Revival":      "Potion of Rivival",           # herbalism 오타
    "Potion of Superior Healing": "Potion of Healing (Superior)",
    "Potion of Greater Healing":  "Potion of Healing (Greater)",
    "Potion of Supreme Healing":  "Potion of Healing (Supreme)",
    "Life\u2019s liquor":     "Life\u2019s Liquor",          # 대소문자
    "Basic Poison":           "Poison, Basic (vial)",
    "Biza\u2019s Breath":     "Biza\u2019s Breath (Inhaled)",
    "Burnt Orthur Fumes":     "Burnt Othur Fumes (Inhaled)", # 원본 오타
    "Drow Poison":            "Drow Poison (Injury)",
    "Essence of Ether":       "Essence of Ether (Inhaled)",
    "Oil of Taggit":          "Oil of Taggit (Contact)",
    "Torpor":                 "Torpor (Ingested)",
    "Assassin\u2019s Blood":  "Assassin\u2019s Blood (Ingested)",
    "Malice":                 "Malice (Inhaled)",
    "Pale Tincture":          "Pale Tincture (Ingested)",
    "Truth Serum":            "Truth Serum (Ingested)",
    "Midnight Tears":         "Midnight Tears (Ingested)",
}


def normalize(name: str) -> str:
    """괄호 옵션 제거 + 소문자 정규화 (자동 매칭용)."""
    name = re.sub(r"\s*\(.*?\)", "", name)  # (xxx) 제거
    name = re.sub(r",.*$", "", name)        # 쉼표 이후 제거 (e.g. "Poison, Basic")
    return name.strip().lower()


def build_item_lookup(source_files: dict) -> dict:
    """아이템 파일들에서 {영문 이름: description} 룩업 구성."""
    lookup = {}
    for src, path in source_files.items():
        if not path.exists():
            print(f"  [경고] 파일 없음: {path}", file=sys.stderr)
            continue
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for en_name, entry in data.get("entries", {}).items():
            desc = entry.get("description", "")
            if desc:
                lookup[en_name] = desc
    return lookup


def find_description(recipe_name: str, lookup: dict) -> tuple[str | None, str]:
    """
    레시피 이름에 대응하는 description을 찾는다.
    반환: (description | None, 매칭 방법)
    """
    # 1. 수동 매핑 우선
    if recipe_name in MANUAL_MAP:
        target = MANUAL_MAP[recipe_name]
        if target in lookup:
            return lookup[target], f"수동 매핑 → '{target}'"

    # 2. 완전 일치
    if recipe_name in lookup:
        return lookup[recipe_name], "완전 일치"

    # 3. 정규화 후 일치 (괄호 제거)
    norm_recipe = normalize(recipe_name)
    for item_name, desc in lookup.items():
        if normalize(item_name) == norm_recipe:
            return desc, f"정규화 일치 → '{item_name}'"

    return None, "매칭 실패"


def main():
    parser = argparse.ArgumentParser(description="레시피 text 필드를 아이템 description과 동기화")
    parser.add_argument("--dry-run", action="store_true", help="파일을 수정하지 않고 결과만 출력")
    args = parser.parse_args()

    print("아이템 번역 파일 로드 중...")
    lookup = build_item_lookup(SOURCE_FILES)
    print(f"  총 {len(lookup)}개 아이템 항목 로드됨\n")

    with open(RECIPES_FILE, encoding="utf-8") as f:
        recipes = json.load(f)

    updated = []
    skipped = []

    for book_name, book in recipes.get("entries", {}).items():
        for page_name, page in book.get("pages", {}).items():
            desc, method = find_description(page_name, lookup)
            if desc is not None:
                old_text = page.get("text", "")
                if old_text != desc:
                    page["text"] = desc
                    updated.append((book_name, page_name, method))
                # 이미 동일하면 조용히 넘김
            else:
                skipped.append((book_name, page_name))

    # 결과 출력
    if updated:
        print(f"[업데이트] {len(updated)}개:")
        for book, page, method in updated:
            print(f"  '{page}'  ({method})")
    else:
        print("[업데이트] 없음 (이미 모두 동기화됨)")

    if skipped:
        print(f"\n[미매칭] {len(skipped)}개 (MANUAL_MAP에 추가 필요):")
        for book, page in skipped:
            print(f"  '{page}'  (책: {book})")

    if not args.dry_run:
        with open(RECIPES_FILE, "w", encoding="utf-8") as f:
            json.dump(recipes, f, ensure_ascii=False, indent=2)
        print(f"\n파일 저장 완료: {RECIPES_FILE}")
    else:
        print("\n[dry-run] 파일 수정 없음")


if __name__ == "__main__":
    main()
