Hooks.once('init', () => {
  if (typeof game.babele !== 'undefined') {
    game.babele.register({
      module: 'rils-potion-crafting-kr',
      lang: 'ko',
      dir: 'languages/ko'
    });
  }
});
