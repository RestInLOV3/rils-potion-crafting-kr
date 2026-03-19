import { ClassicLevel } from 'classic-level';
import { readdirSync } from 'fs';

const packPath = 'C:/Users/HGray/Desktop/Artwork/FVTT/modules/potion-crafting-and-gathering/packs/potion-crafting-and-gathering-ingredients';

console.log('1. 디렉토리 파일 목록:');
console.log(readdirSync(packPath));

console.log('\n2. ClassicLevel 생성...');
const db = new ClassicLevel(packPath, { valueEncoding: 'json' });
console.log('   status after new:', db.status);

db.on('error', (e) => console.error('   error event:', e));
db.on('open',  () => console.log('   open event fired, status:', db.status));

console.log('\n3. await db.open() 호출...');
try {
  await db.open();
  console.log('   open() 성공, status:', db.status);
  const entries = await db.iterator().all();
  console.log('   entries count:', entries.length);
  if (entries.length) console.log('   first key:', entries[0][0]);
  await db.close();
} catch (e) {
  console.error('   open() 실패:', e.message);
  console.error('   stack:', e.stack);
  console.error('   db.status:', db.status);
}
