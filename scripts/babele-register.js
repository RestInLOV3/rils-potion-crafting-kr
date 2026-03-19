Hooks.once('babele.ready', () => {
  if (typeof game.babele !== 'undefined') {
    game.babele.register({
      module: 'rils-potion-crafting-kr',
      lang: 'ko',
      dir: 'modules/rils-potion-crafting-kr/languages/ko'
    });
  }
});
