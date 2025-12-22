import { db } from '../../src/shared/db.js';
import { 
  users, works, chapters, workViews, shelves, 
  genres, tags, worksToGenres, worksToTags, ratings 
} from '../../src/shared/schema.js';

async function main() {
  console.log('Очистка и наполнение базы данных...');

  await db.delete(ratings);
  await db.delete(workViews);
  await db.delete(worksToGenres);
  await db.delete(worksToTags);
  await db.delete(chapters);
  await db.delete(shelves);
  await db.delete(genres);
  await db.delete(tags);
  await db.delete(works);
  await db.delete(users);

  // 1. Создаем справочники
  const genresList = await db.insert(genres).values([
    { name: 'Фэнтези' }, { name: 'Детектив' }, { name: 'Хоррор' },
    { name: 'Триллер' }, { name: 'Романтика' }
  ]).returning();

  const tagsList = await db.insert(tags).values([
    { name: 'Магия' }, { name: 'Будущее' }, { name: 'Тайны' }
  ]).returning();

  // 2. Генерируем 20 авторов
  console.log('Создание 20 авторов...');
  const authors = [];
  for (let i = 1; i <= 20; i++) {
    const [user] = await db.insert(users).values({
      login: `author_${i}`,
      email: `author${i}@example.com`,
      passwordHash: 'hash',
      publicName: `АВТОР ТЕСТОВЫЙ ${i}`,
      avatarUrl: null, // БЕЗ АВАТАРОК
      emailVerified: true
    }).returning();
    
    // Каждому автору создаем базовые полки
    await db.insert(shelves).values([
      { userId: user.id, shelfType: 'reading' },
      { userId: user.id, shelfType: 'bookmarks' }
    ]);
    
    authors.push(user);
  }

  // 3. Генерируем по 2-5 произведений для каждого автора (чтобы проверить счетчик)
  console.log('Создание произведений для авторов...');
  
  for (const author of authors) {
    // Случайное количество книг от 2 до 5
    const bookCount = Math.floor(Math.random() * 4) + 2; 

    for (let j = 1; j <= bookCount; j++) {
      const [work] = await db.insert(works).values({
        title: `Книга автора ${author.id} - №${j}`,
        description: `Описание для теста верстки без обложки. Номер ${j}`,
        authorId: author.id,
        isPublic: true,
        coverUrl: null, // БЕЗ ОБЛОЖЕК
      }).returning();

      // Жанры и метки
      await db.insert(worksToGenres).values({ 
        workId: work.id, 
        genreId: genresList[Math.floor(Math.random() * genresList.length)].id 
      });

      // Главы
      await db.insert(chapters).values({
        workId: work.id,
        title: 'Глава 1. Начало',
        content: 'Контент тестовой главы',
        position: 1
      });
    }
  }

  console.log('Готово! База наполнена');
  console.log('Создано авторов:', authors.length);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});