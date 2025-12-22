import { db } from '../../src/shared/db.js';
import { 
  users, works, chapters, workViews, shelves, 
  genres, tags, worksToGenres, worksToTags, ratings 
} from '../../src/shared/schema.js';

async function main() {
  console.log('Очистка и наполнение базы данных...');

  // Удаляем в порядке иерархии зависимостей
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

  // 1. Создаем тестового автора
  const [author] = await db.insert(users).values({
    login: 'wedyeth',
    email: 'test@example.com',
    passwordHash: 'fake_hash',
    publicName: 'ИВАН ИВАНОВ',
    emailVerified: true,
    bio: 'МЫ МУТАНТЫ ИЗ КАНАЛИЗАЦИИ ЗАРАЖЕННЫЕ РАДИАЦИЕЙ РАДИАЦИЕЙ РАДИАЦИЕЙ'
  }).returning();

  // Создаем базовые полки
  const baseShelves = [
      { userId: author.id, shelfType: 'ЧИТАЮ', isPublic: true },
      { userId: author.id, shelfType: 'ПРОЧИТАНО', isPublic: true },
      { userId: author.id, shelfType: 'ЗАКЛАДКИ', isPublic: true }
  ];
  await db.insert(shelves).values(baseShelves);

  // 2. Наполняем справочник жанров
  const genresData = [
    { name: 'Фэнтези' }, { name: 'Детектив' }, { name: 'Хоррор' },
    { name: 'Триллер' }, { name: 'Романтика' }, { name: 'Сай-фай' },
    { name: 'Драма' }, { name: 'Приключения' }, { name: 'Мистика' },
    { name: 'Киберпанк' }
  ];
  const genresList = await db.insert(genres).values(genresData).returning();

  // 3. Наполняем справочник меток
  const tagsData = [
    { name: 'Магия' }, { name: 'Будущее' }, { name: 'Тайны' },
    { name: 'Выживание' }, { name: 'Любовь' }, { name: 'Жестокость' },
    { name: 'Артефакты' }, { name: 'Поиск истины' }, { name: 'Война' },
    { name: 'Нуар' }
  ];
  const tagsList = await db.insert(tags).values(tagsData).returning();

  // 4. Генерируем 20 произведений
  console.log('Создание 20 произведений...');
  
  for (let i = 1; i <= 20; i++) {
    const title = `ПРОИЗВЕДЕНИЕ №${i}`;
    const [work] = await db.insert(works).values({
      title: title,
      description: `Это описание для тестового произведения под номером ${i}. Оно содержит в себе глубокий смысл и проверку пагинации.`,
      authorId: author.id,
      isPublic: true,
      coverUrl: null
    }).returning();

    // Привязываем 1-2 случайных жанра
    const randomGenres = genresList.sort(() => 0.5 - Math.random()).slice(0, 2);
    for (const g of randomGenres) {
      await db.insert(worksToGenres).values({ workId: work.id, genreId: g.id });
    }

    // Привязываем 1-3 случайные метки
    const randomTags = tagsList.sort(() => 0.5 - Math.random()).slice(0, 3);
    for (const t of randomTags) {
      await db.insert(worksToTags).values({ workId: work.id, tagId: t.id });
    }

    // Создаем по паре глав для каждой книги
    await db.insert(chapters).values([
      { workId: work.id, title: 'ПРОЛОГ', content: 'Начало истории...', position: 1 },
      { workId: work.id, title: 'ГЛАВА 1', content: 'Развитие событий...', position: 2 }
    ]);

    // Добавляем случайное количество просмотров (имитация популярности)
    const viewsCount = Math.floor(Math.random() * 10);
    for (let v = 0; v < viewsCount; v++) {
        // В реальности userId должен быть уникальным для workViews по схеме, 
        // но для сида просто создадим одну запись от автора, если нужно для теста
        if (v === 0) await db.insert(workViews).values({ workId: work.id, userId: author.id }).onConflictDoNothing();
    }
  }

  // 5. Создаем дефолтные полки для пользователя
  await db.insert(shelves).values([
    { userId: author.id, shelfType: 'reading', isPublic: true },
    { userId: author.id, shelfType: 'completed', isPublic: true },
    { userId: author.id, shelfType: 'bookmarks', isPublic: true }
  ]);

  console.log('Готово! База успешно наполнена 20 произведениями.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});