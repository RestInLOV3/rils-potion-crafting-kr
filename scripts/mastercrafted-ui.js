/**
 * mastercrafted-ui.js
 * Mastercrafted UI 표시 이름 한글화 패치.
 *
 * - 레시피 시트 렌더 시: 컴포넌트 저장 이름을 Babele 한글 이름으로 자동 업데이트
 *   (이름 기반 재료 매칭이 즉시 작동하도록)
 * - 구성 요소 설정 폼: 이름 입력 필드에 한글 이름 표시
 */

// 레시피 시트: 컴포넌트 이름을 한글로 자동 저장 + 툴팁 교체
Hooks.on("renderMastercraftedRecipeSheet", (app, html) => {
    const recipe = app.recipe;
    const canEdit = recipe?.document?.isOwner;

    const allComponents = [
        ...(recipe?.ingredients ?? []).flatMap(i => i.components ?? []),
        ...(recipe?.products   ?? []).flatMap(p => p.components ?? []),
    ];

    for (const component of allComponents) {
        if (!component.uuid) continue;
        fromUuid(component.uuid).then(item => {
            if (!item?.name) return;

            // 저장 이름이 다를 때만 업데이트 (권한 있을 때)
            if (canEdit && item.name !== component.name) {
                component.update({ name: item.name });
            }

            // 툴팁 교체 (data-component-id로 대상 특정)
            const el = html.querySelector(`.mastercrafted-component[data-component-id="${component.id}"]`);
            if (!el) return;
            const tooltip = el.dataset.tooltip ?? "";
            el.dataset.tooltip = tooltip.includes(" (x")
                ? item.name + tooltip.slice(tooltip.indexOf(" (x"))
                : item.name;
        });
    }
});

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
