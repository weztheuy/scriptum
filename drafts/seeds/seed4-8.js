import { db } from '../../src/shared/db.js';
import { 
  users, works, chapters, workViews, shelves, 
  genres, tags, worksToGenres, worksToTags, ratings 
} from '../../src/shared/schema.js';

async function main() {
  console.log('Очистка базы данных...');
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

  // 1. НАПОЛНЕНИЕ ЖАНРОВ (Реальный список)
  console.log('Заполнение жанров...');
  const genresData = [
    { name: 'Фэнтези' }, { name: 'Детектив' }, { name: 'Хоррор' },
    { name: 'Триллер' }, { name: 'Романтика' }, { name: 'Научная фантастика' },
    { name: 'Драма' }, { name: 'Приключения' }, { name: 'Мистика' },
    { name: 'Классика' }, { name: 'Антиутопия' }, { name: 'Психология' },
    { name: 'Поэзия' }, { name: 'Киберпанк' }, { name: 'Трагедия' }
  ];
  const genresList = await db.insert(genres).values(genresData).returning();
  const getG = (name) => genresList.find(g => g.name === name).id;

  // 2. НАПОЛНЕНИЕ МЕТОК (Реальный список)
  console.log('Заполнение меток...');
  const tagsData = [
    { name: 'Магия' }, { name: 'Будущее' }, { name: 'Тайны' },
    { name: 'Выживание' }, { name: 'Любовь' }, { name: 'Жестокость' },
    { name: 'Артефакты' }, { name: 'Поиск истины' }, { name: 'Война' },
    { name: 'Нуар' }, { name: 'Дарк' }, { name: 'Философия' },
    { name: 'Эльфы' }, { name: 'Роботы' }, { name: 'Космос' }
  ];
  const tagsList = await db.insert(tags).values(tagsData).returning();
  const getT = (name) => tagsList.find(t => t.name === name).id;

  // 3. РЕАЛЬНЫЕ АВТОРЫ И ПРОИЗВЕДЕНИЯ
  const authorsData = [
    {
      user: { login: 'pushkin', email: 'as@pushkin.ru', passwordHash: '123', publicName: 'АЛЕКСАНДР ПУШКИН', bio: 'Солнце русской поэзии.' },
      works: [
        { title: 'Евгений Онегин', desc: 'Роман в стихах, энциклопедия русской жизни.', g: ['Классика', 'Романтика'], t: ['Любовь', 'Философия'] },
        { title: 'Пиковая дама', desc: 'Мистическая повесть о старой графине и трех картах.', g: ['Мистика', 'Классика'], t: ['Тайны', 'Жестокость'] }
      ]
    },
    {
      user: { login: 'dostoevsky', email: 'fedor@dost.ru', passwordHash: '123', publicName: 'ФЕДОР ДОСТОЕВСКИЙ', bio: 'Исследователь человеческой души.' },
      works: [
        { title: 'Преступление и наказание', desc: 'Психологический отчет одного преступления.', g: ['Классика', 'Психология'], t: ['Поиск истины', 'Жестокость'] },
        { title: 'Идиот', desc: 'История о «положительно прекрасном человеке» в мире безумия.', g: ['Классика', 'Драма'], t: ['Любовь', 'Философия'] }
      ]
    },
    {
      user: { login: 'lovecraft', email: 'howard@hpl.com', passwordHash: '123', publicName: 'Г. Ф. ЛАВКРАФТ', bio: 'Мастер космического ужаса.' },
      works: [
        { title: 'Зов Ктулху', desc: 'Тварь из глубин океана, сводящая с ума.', g: ['Хоррор', 'Мистика'], t: ['Дарк', 'Космос'] },
        { title: 'Хребты Безумия', desc: 'Экспедиция в Антарктику находит древнее зло.', g: ['Хоррор', 'Научная фантастика'], t: ['Выживание', 'Тайны'] }
      ]
    },
    {
      user: { login: 'orwell', email: 'george@orwell.uk', passwordHash: '123', publicName: 'ДЖОРДЖ ОРУЭЛЛ', bio: 'Писатель и публицист.' },
      works: [
        { title: '1984', desc: 'Старший Брат следит за тобой.', g: ['Антиутопия', 'Триллер'], t: ['Будущее', 'Война'] },
        { title: 'Скотный двор', desc: 'Притча о революции и ее последствиях.', g: ['Классика', 'Драма'], t: ['Философия'] }
      ]
    }
  ];

  console.log('Создание авторов и их произведений...');

  for (const entry of authorsData) {
    // Вставляем пользователя
    const [author] = await db.insert(users).values(entry.user).returning();

    // Создаем полки для автора
    await db.insert(shelves).values([
      { userId: author.id, shelfType: 'reading' },
      { userId: author.id, shelfType: 'completed' },
      { userId: author.id, shelfType: 'bookmarks' }
    ]);

    // Вставляем его книги
    for (const wData of entry.works) {
      const [work] = await db.insert(works).values({
        authorId: author.id,
        title: wData.title,
        description: wData.desc,
        isPublic: true
      }).returning();

      // Жанры
      for (const genreName of wData.g) {
        await db.insert(worksToGenres).values({ workId: work.id, genreId: getG(genreName) });
      }

      // Метки
      for (const tagName of wData.t) {
        await db.insert(worksToTags).values({ workId: work.id, tagId: getT(tagName) });
      }

      // Добавляем Пролог
      await db.insert(chapters).values({
        workId: work.id,
        title: 'ПРОЛОГ',
        content: 'Это начало великой истории...',
        position: 1
      });

      // Имитируем случайный рейтинг
      await db.insert(ratings).values({
        workId: work.id,
        userId: author.id, // Пускай сам себе поставил 5 для старта
        score: 5
      });
    }
  }

  console.log('Готово! База наполнена реальными классиками и произведениями.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});