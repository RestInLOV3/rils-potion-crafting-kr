/**
 * mastercrafted-ui.js
 * Mastercrafted UI 표시 이름 한글화 패치.
 * fromUuid(async)로 Babele 번역이 적용된 이름을 가져와
 * 레시피 시트 툴팁과 구성 요소 설정 폼의 이름 필드에 반영합니다.
 */

// 구성 요소 설정 폼: 이름 입력 필드 한글화
Hooks.on("renderComponentEditForm", (app, _html) => {
    const uuid = app.component?.uuid;
    if (!uuid) return;
    fromUuid(uuid).then(item => {
        if (!item?.name) return;
        const nameInput = app.element?.querySelector('input[name="name"]');
        if (nameInput) nameInput.value = item.name;
    });
});

// 레시피 시트: 재료/결과물 컴포넌트 툴팁 한글화
// 툴팁 형식 — 재료: "이름 (xN)", 결과물: "이름"
Hooks.on("renderMastercraftedRecipeSheet", (_app, html) => {
    html.querySelectorAll(".mastercrafted-component[data-uuid]").forEach(el => {
        const uuid = el.dataset.uuid;
        if (!uuid) return;
        fromUuid(uuid).then(item => {
            if (!item?.name) return;
            const tooltip = el.dataset.tooltip ?? "";
            el.dataset.tooltip = tooltip.includes(" (x")
                ? item.name + tooltip.slice(tooltip.indexOf(" (x"))
                : item.name;
        });
    });
});
