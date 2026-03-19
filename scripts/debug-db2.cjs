// 네이티브 바인딩을 직접 호출해서 실제 LevelDB 에러 확인
const binding = require('../node_modules/classic-level/prebuilds/win32-x64/node.napi.node');

const location = String.raw`C:\Users\HGray\Desktop\Artwork\FVTT\modules\potion-crafting-and-gathering\packs\potion-crafting-and-gathering-ingredients`;

console.log('db_open 직접 호출...');
const db = binding.db_init();

binding.db_open(db, location, {
  createIfMissing: false,
  errorIfExists: false,
  compression: true,
  readOnly: true,
}, function(err) {
  if (err) {
    console.error('실제 LevelDB 에러:', err);
    return;
  }
  console.log('열기 성공!');
  binding.db_get_property(db, 'leveldb.stats', function(err, value) {
    console.log('stats err:', err);
    console.log('stats:', value);
    binding.db_close(db, () => console.log('닫기 완료'));
  });
});
