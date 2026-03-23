Hooks.once('init', () => {
  if (typeof game.babele !== 'undefined') {
    game.babele.register({
      module: 'rils-potion-crafting-kr',
      lang: 'ko',
      dir: 'languages/ko'
    });

    game.babele.registerConverters({
      /**
       * RecipeBook의 recipes 배열을 번역 데이터로 처리하는 converter.
       * 번역 파일의 entries[bookName].recipes 는 { [영문 레시피명]: { name, description } } 형태.
       */
      translateRecipes: (recipes, translations) => {
        if (!translations || !Array.isArray(recipes)) return recipes;
        return recipes.map((recipe) => {
          const t = translations[recipe.name];
          if (!t) return recipe;
          return {
            ...recipe,
            name: t.name ?? recipe.name,
            ...(t.description != null && { description: t.description }),
          };
        });
      },
    });
  }
});
