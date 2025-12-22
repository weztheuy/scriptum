import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { pipeline } from 'stream/promises';
import fs from 'fs/promises'; 
import sharp from 'sharp';
import fastifyView from '@fastify/view';
import fastifyStatic from '@fastify/static';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import fastifyFormbody from '@fastify/formbody';

import { db } from './shared/db.js';
import { 
    works, 
    users, 
    chapters, 
    genres, 
    worksToGenres, 
    tags,           
    worksToTags,    
    shelves,        
    workViews,
    ratings,
    worksToShelves,
    comments,
    commentLikes
} from './shared/schema.js';
import { eq, asc, desc, count, sql, and } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fastify = Fastify({ logger: true });

import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';

// Сразу после инициализации fastify:
fastify.register(fastifyMultipart, {
    limits: {
        fieldNameSize: 100, // Макс размер имени поля в байтах
        fieldSize: 5000,     // Макс размер текстового поля
        fields: 200,         // Макс кол-во текстовых полей
        fileSize: 5242880,  // Лимит 5МБ
        files: 1            // Разрешаем только 1 файл за раз
    }
});

fastify.register(fastifyFormbody);

import authRoutes from './modules/auth/auth.routes.js';

fastify.register(authRoutes, { prefix: '/auth' });

fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/', 
});

fastify.register(fastifyView, {
    engine: { ejs },
    root: path.join(__dirname, 'views'),
    layout: 'layout.ejs', 
});

fastify.register(fastifyCookie);
fastify.register(fastifySession, {
  secret: 'a-very-long-secret-key-at-least-32-characters',
  cookie: { secure: false }
});

fastify.get('/', async (request, reply) => {
    try {
        const baseSelect = {
            id: works.id,
            title: works.title,
            description: works.description,
            coverUrl: works.coverUrl,
            authorName: users.publicName,
            authorId: users.id
        };

        const popular = await db.select(baseSelect)
            .from(works)
            .leftJoin(users, eq(works.authorId, users.id))
            .leftJoin(workViews, eq(works.id, workViews.workId))
            .where(eq(works.isPublic, true))
            .groupBy(works.id, users.id) // Группируем, чтобы count работал корректно
            .orderBy(desc(count(workViews.id)))
            .orderBy(desc(works.id))
            .limit(4)
            .all();

        const newest = await db.select(baseSelect)
            .from(works)
            .leftJoin(users, eq(works.authorId, users.id))
            .where(eq(works.isPublic, true))
            .orderBy(desc(works.createdAt))
            .limit(4)
            .all();

        return reply.view('pages/home/home.ejs', {
            title: 'Главная',
            user: request.session?.user || null, 
            newWorks: newest,      
            popularWorks: popular
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка базы данных');
    }
});

// --- СТРАНИЦА СОЗДАНИЯ ПРОИЗВЕДЕНИЯ ---
fastify.get('/works/new', async (request, reply) => {
    const currentUser = request.session?.user;
    if (!currentUser) return reply.redirect('/auth/login');

    try {
        const allGenres = await db.select().from(genres).all();
        const allTags = await db.select().from(tags).all();

        return reply.view('pages/works/work-form.ejs', {
            title: 'Новое произведение',
            user: currentUser,
            allGenres,
            allTags
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка загрузки данных');
    }
});

// --- ОБРАБОТКА СОЗДАНИЯ ---
fastify.post('/works/new', async (request, reply) => {
    const currentUser = request.session?.user;
    if (!currentUser) return reply.redirect('/auth/login');

    const parts = request.parts();
    let workData = { 
        authorId: currentUser.id, 
        title: '', 
        description: '', 
        isPublic: false, // значение по умолчанию
        coverUrl: '/assets/default-cover.png' 
    };
    let selectedGenres = [];
    let selectedTags = [];

    for await (const part of parts) {
        if (part.file) {
            if (part.filename) {
                const fileName = `cover_${Date.now()}.webp`;
                const uploadPath = path.join(__dirname, '../public/uploads/covers', fileName);
                
                try {
                    await sharp(await part.toBuffer())
                        .resize(600, 900, { fit: 'cover', position: 'center' })
                        .webp()
                        .toFile(uploadPath);
                    workData.coverUrl = `/uploads/covers/${fileName}`;
                } catch (err) {
                    fastify.log.error('Ошибка обработки изображения:', err);
                }
            }
        } else {
            if (part.fieldname === 'genres') selectedGenres.push(parseInt(part.value));
            else if (part.fieldname === 'tags') selectedTags.push(parseInt(part.value));
            else if (part.fieldname === 'isPublic') workData.isPublic = part.value === 'true';
            else workData[part.fieldname] = part.value;
        }
    }

    try {
        const createdWorkId = await db.transaction(async (tx) => {
            // 1. Создаем произведение
            const [inserted] = await tx.insert(works).values(workData).returning();

            // 2. Жанры
            if (selectedGenres.length > 0) {
                await tx.insert(worksToGenres).values(
                    selectedGenres.map(id => ({ workId: inserted.id, genreId: id }))
                );
            }

            // 3. Теги
            if (selectedTags.length > 0) {
                await tx.insert(worksToTags).values(
                    selectedTags.map(id => ({ workId: inserted.id, tagId: id }))
                );
            }

            return inserted.id; // Возвращаем ID созданной записи
        });

        return reply.redirect(`/works/${createdWorkId}`);
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка при сохранении в базу');
    }
});

// --- ПРОСМОТР ПРОИЗВЕДЕНИЯ ---
fastify.get('/works/:id', async (request, reply) => {
    try {
        const workId = parseInt(request.params.id);
        const currentUser = request.session?.user || null;
        
        const result = await db.select({
            work: works,
            authorName: users.publicName
        })
        .from(works)
        .leftJoin(users, eq(works.authorId, users.id))
        .where(eq(works.id, workId))
        .get();

        if (!result) return reply.code(404).send('Произведение не найдено');

        // ПРОВЕРКА ПРИВАТНОСТИ
        const isAuthor = currentUser && currentUser.id === result.work.authorId;
        if (!result.work.isPublic && !isAuthor) {
            return reply.code(403).send('Это произведение скрыто автором или находится на модерации');
        }

        let userRating = 0;
        let currentShelfLabel = 'В КОЛЛЕКЦИЮ';

        if (currentUser) {
            // Учет просмотров (только для публичных или автором для теста)
            try {
                await db.insert(workViews).values({
                    workId: workId,
                    userId: currentUser.id
                }).onConflictDoNothing().run();
            } catch (e) {}

            const userRatingRow = await db.select()
                .from(ratings)
                .where(and(eq(ratings.workId, workId), eq(ratings.userId, currentUser.id)))
                .get();
            
            if (userRatingRow) userRating = userRatingRow.score;

            const currentShelfEntry = await db.select({ type: shelves.shelfType })
                .from(worksToShelves)
                .innerJoin(shelves, eq(worksToShelves.shelfId, shelves.id))
                .where(and(
                    eq(worksToShelves.workId, workId),
                    eq(shelves.userId, currentUser.id)
                ))
                .get();
            
            const labels = { 'reading': 'ЧИТАЮ', 'completed': 'ПРОЧИТАНО', 'bookmarks': 'В ЗАКЛАДКАХ' };
            if (currentShelfEntry) {
                currentShelfLabel = labels[currentShelfEntry.type];
            }
        }

        const page = parseInt(request.query.page) || 1;
        const limit = 10;

        const { items: commentsList, total: commentsTotal } = await getCommentsWithData(
            workId, 
            null, // На главной странице работы только общие комменты
            currentUser?.id, 
            page, 
            limit
        );



        const avgRatingResult = await db.select({
            avgScore: sql`avg(${ratings.score})`,
            count: sql`count(${ratings.id})`
        })
        .from(ratings)
        .where(eq(ratings.workId, workId))
        .get();

        const finalRating = avgRatingResult?.avgScore ? Number(avgRatingResult.avgScore).toFixed(1) : "0.0";

        const viewsCountResult = await db.select({ value: count() })
            .from(workViews)
            .where(eq(workViews.workId, workId))
            .get();

        const workGenres = await db.select({ name: genres.name, id: genres.id })
            .from(worksToGenres)
            .leftJoin(genres, eq(worksToGenres.genreId, genres.id))
            .where(eq(worksToGenres.workId, workId));

        const workTags = await db.select({ name: tags.name, id: tags.id })
            .from(worksToTags)
            .leftJoin(tags, eq(worksToTags.tagId, tags.id))
            .where(eq(worksToTags.workId, workId));

        const chaptersList = await db.select()
            .from(chapters)
            .where(eq(chapters.workId, workId))
            .orderBy(asc(chapters.position));

        let userShelves = [];
        if (currentUser) {
            userShelves = await db.select().from(shelves).where(eq(shelves.userId, currentUser.id));
        }

        return reply.view('pages/works/work.ejs', {
            title: result.work.title,
            item: result.work,
            authorName: result.authorName,
            genres: workGenres,
            tags: workTags,
            displayRating: finalRating,
            viewsCount: viewsCountResult.value,
            chapters: chaptersList,
            userShelves: userShelves,
            currentShelfLabel: currentShelfLabel,
            userRating: userRating,
        comments: commentsList,
        commentsTotal: commentsTotal,
        currentPage: page,
        totalPages: Math.ceil(commentsTotal / limit),
            user: currentUser,
            isAuthor
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка сервера');
    }
});

fastify.get('/works/:id/edit', async (request, reply) => {
    const currentUser = request.session?.user;
    if (!currentUser) return reply.redirect('/auth/login');

    const workId = parseInt(request.params.id);
    const item = await db.select().from(works).where(eq(works.id, workId)).get();

    if (!item || item.authorId !== currentUser.id) {
        return reply.code(403).send('Доступ запрещен');
    }

    // Загружаем только необходимое: жанры и теги
    const currentGenres = await db.select({ id: worksToGenres.genreId }).from(worksToGenres).where(eq(worksToGenres.workId, workId));
    const currentTags = await db.select({ id: worksToTags.tagId }).from(worksToTags).where(eq(worksToTags.workId, workId));
    
    const allGenres = await db.select().from(genres);
    const allTags = await db.select().from(tags);

    return reply.view('pages/works/work-form.ejs', {
        title: `Редактирование: ${item.title}`,
        user: currentUser, // Передаем юзера для корректного хэдера
        item,
        allGenres,
        allTags,
        currentGenreIds: currentGenres.map(g => g.id),
        currentTagIds: currentTags.map(t => t.id)
    });
});

fastify.post('/works/:id/edit', async (request, reply) => {
    const currentUser = request.session?.user;
    if (!currentUser) return reply.redirect('/auth/login');
    
    const workId = parseInt(request.params.id);
    const parts = request.parts();

    const existingWork = await db.query.works.findFirst({ where: eq(works.id, workId) });
    if (!existingWork || existingWork.authorId !== currentUser.id) return reply.code(403).send('Запрещено');

    let updateData = { 
        title: '', 
        description: '', 
        isPublic: existingWork.isPublic 
    };
    let newCoverUrl = existingWork.coverUrl;
    let selectedGenres = [];
    let selectedTags = [];
    let coverAction = 'keep'; // По умолчанию ничего не трогаем

    for await (const part of parts) {
        if (part.file) {
            // Если файл прикреплен и у него есть имя (пользователь выбрал новый файл)
            if (part.filename) {
                const fileName = `cover_${Date.now()}.webp`;
                const uploadPath = path.join(__dirname, '../public/uploads/covers', fileName);
                
                try {
                    await sharp(await part.toBuffer())
                        .resize(600, 900, { fit: 'cover' })
                        .webp()
                        .toFile(uploadPath);

                    // Удаляем старый физический файл, если он не дефолтный
                    if (existingWork.coverUrl && !existingWork.coverUrl.includes('default-cover')) {
                        const oldPath = path.join(__dirname, '../public', existingWork.coverUrl);
                        try {
                            await fs.unlink(oldPath);
                        } catch (err) {
                            console.error('Ошибка удаления старой обложки:', err);
                        }
                    }
                    newCoverUrl = `/uploads/covers/${fileName}`;
                    coverAction = 'update'; 
                } catch (err) {
                    fastify.log.error('Ошибка Sharp:', err);
                }
            }
        } else {
            // Обработка текстовых полей
            if (part.fieldname === 'genres') {
                selectedGenres.push(parseInt(part.value));
            } else if (part.fieldname === 'tags') {
                selectedTags.push(parseInt(part.value));
            } else if (part.fieldname === 'cover_action') {
                coverAction = part.value; // 'delete' или 'keep'
            } else if (part.fieldname === 'isPublic') {
                updateData.isPublic = part.value === 'true';
            } else {
                updateData[part.fieldname] = part.value;
            }
        }
    }

    // ВАЖНО: Если пользователь нажал "удалить" и при этом НЕ загрузил новый файл в этом же запросе
    if (coverAction === 'delete' && newCoverUrl === existingWork.coverUrl) {
        if (existingWork.coverUrl && !existingWork.coverUrl.includes('default-cover')) {
            const oldPath = path.join(__dirname, '../public', existingWork.coverUrl);
            try {
                await fs.unlink(oldPath);
            } catch (err) {
                console.error('Ошибка удаления старой обложки:', err);
            }
        }
        newCoverUrl = '/assets/default-cover.png';
    }

    // Сохранение в базу
    await db.transaction(async (tx) => {
        await tx.update(works)
            .set({ ...updateData, coverUrl: newCoverUrl })
            .where(eq(works.id, workId));

        // Синхронизация жанров и тегов
        await tx.delete(worksToGenres).where(eq(worksToGenres.workId, workId));
        await tx.delete(worksToTags).where(eq(worksToTags.workId, workId));
        
        if (selectedGenres.length > 0) {
            await tx.insert(worksToGenres).values(selectedGenres.map(id => ({ workId, genreId: id })));
        }
        if (selectedTags.length > 0) {
            await tx.insert(worksToTags).values(selectedTags.map(id => ({ workId, tagId: id })));
        }
    });

    return reply.redirect(`/works/${workId}`);
});

fastify.get('/works/:id/delete', async (request, reply) => {
    const currentUser = request.session?.user;
    if (!currentUser) return reply.redirect('/auth/login');

    const workId = parseInt(request.params.id);
    const item = await db.select().from(works).where(eq(works.id, workId)).get();

    if (!item || item.authorId !== currentUser.id) {
        return reply.code(403).send('Доступ запрещен');
    }

    try {
        await tx.delete(works).where(eq(works.id, workId));

        if (item.coverUrl && !item.coverUrl.includes('default-cover')) {
            const oldPath = path.join(__dirname, '../public', item.coverUrl);
            await fs.unlink(oldPath, (err) => {
                if (err) console.error('Ошибка удаления файла:', err);
            });
        }

        return reply.redirect('/'); // Возвращаем на главную после удаления
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка при удалении произведения');
    }
});

fastify.post('/shelves/add', async (request, reply) => {
    const { shelfId, workId } = request.body;
    const currentUser = request.session?.user;

    if (!currentUser) return reply.code(401).send({ error: 'Нужна авторизация' });

    try {
        const shelf = await db.select().from(shelves)
            .where(and(eq(shelves.id, shelfId), eq(shelves.userId, currentUser.id)))
            .get();

        if (!shelf) return reply.code(403).send({ error: 'Доступ запрещен' });

        const userShelvesIds = db.select({ id: shelves.id })
            .from(shelves)
            .where(eq(shelves.userId, currentUser.id));

        await db.delete(worksToShelves)
            .where(and(
                eq(worksToShelves.workId, workId),
                sql`${worksToShelves.shelfId} IN ${userShelvesIds}`
            ))
            .run();

        await db.insert(worksToShelves).values({ shelfId, workId }).run();

        return { success: true };
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Ошибка сервера' });
    }
});

fastify.post('/works/:id/rate', async (request, reply) => {
    const workId = parseInt(request.params.id);
    const { score } = request.body;
    const currentUser = request.session?.user;

    if (!currentUser) return reply.code(401).send({ error: 'Нужна авторизация' });
    if (!score || score < 1 || score > 5) return reply.code(400).send({ error: 'Неверная оценка' });

    try {
        // 1. Проверяем, существует ли произведение и кто его автор
        const work = await db.select().from(works).where(eq(works.id, workId)).get();
        
        if (!work) {
            return reply.code(404).send({ error: 'Произведение не найдено' });
        }

        // 2. ЗАЩИТА: Если текущий пользователь — автор, запрещаем оценку
        if (work.authorId === currentUser.id) {
            return reply.code(403).send({ error: 'Авторы не могут оценивать свои собственные произведения' });
        }

        // 3. Сохраняем или обновляем оценку
        await db.insert(ratings)
            .values({ workId, userId: currentUser.id, score })
            .onConflictDoUpdate({
                target: [ratings.workId, ratings.userId],
                set: { score }
            })
            .run();

        // 4. Получаем средний рейтинг
        const stats = await db.select({ avg: sql`avg(${ratings.score})` })
            .from(ratings)
            .where(eq(ratings.workId, workId))
            .get();

        return { 
            success: true, 
            newAvg: stats?.avg ? Number(stats.avg).toFixed(1) : "0.0"
        };
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Ошибка сохранения' });
    }
});

// --- DELETE: УДАЛЕНИЕ РЕЙТИНГА ---
fastify.delete('/works/:id/rate', async (request, reply) => {
    const workId = parseInt(request.params.id);
    const currentUser = request.session?.user;

    if (!currentUser) return reply.code(401).send({ error: 'Нужна авторизация' });

    try {
        await db.delete(ratings)
            .where(and(eq(ratings.workId, workId), eq(ratings.userId, currentUser.id)))
            .run();

        const stats = await db.select({ avg: sql`avg(${ratings.score})` })
            .from(ratings)
            .where(eq(ratings.workId, workId))
            .get();

        return { 
            success: true, 
            newAvg: stats?.avg ? Number(stats.avg).toFixed(1) : "0.0"
        };
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Ошибка удаления' });
    }
});

fastify.get('/works', async (request, reply) => {
    try {
        let { search, sort, genres: selectedGenresQuery, tags: selectedTagsQuery, page } = request.query;
        const currentPage = parseInt(page) || 1;
        const limitPerPage = 12;
        const offset = (currentPage - 1) * limitPerPage;

        const selectedGenres = selectedGenresQuery 
            ? (Array.isArray(selectedGenresQuery) ? selectedGenresQuery : [selectedGenresQuery]).map(Number) 
            : [];
        const selectedTags = selectedTagsQuery 
            ? (Array.isArray(selectedTagsQuery) ? selectedTagsQuery : [selectedTagsQuery]).map(Number) 
            : [];

        // 1. Справочники
        const [allGenresList, allTagsList] = await Promise.all([
            db.select().from(genres).all(),
            db.select().from(tags).all()
        ]);

        // 2. Подзапрос просмотров
        const viewsSubquery = db.select({ 
            workId: workViews.workId, 
            vCount: count(workViews.id).as('v_count') 
        })
        .from(workViews)
        .groupBy(workViews.workId)
        .as('views_sq');

        // 3. Формируем базовые фильтры
        const conditions = [eq(works.isPublic, true)];
        if (search) {
            conditions.push(sql`${works.title} LIKE ${'%' + search + '%'}`);
        }
        
        // Добавляем фильтры жанров и тегов через EXISTS
        selectedGenres.forEach(gId => {
            conditions.push(sql`EXISTS (SELECT 1 FROM ${worksToGenres} WHERE ${worksToGenres.workId} = ${works.id} AND ${worksToGenres.genreId} = ${gId})`);
        });
        selectedTags.forEach(tId => {
            conditions.push(sql`EXISTS (SELECT 1 FROM ${worksToTags} WHERE ${worksToTags.workId} = ${works.id} AND ${worksToTags.tagId} = ${tId})`);
        });

        const finalWhere = and(...conditions);

        // 4. Считаем ОБЩЕЕ количество (для пагинации) БЕЗ загрузки данных
        const [totalRes] = await db.select({ count: count() })
            .from(works)
            .where(finalWhere)
            .all();
        const totalItems = totalRes.count;
        const totalPages = Math.ceil(totalItems / limitPerPage);

        // 5. Формируем основной запрос данных
        let query = db.select({
            id: works.id,
            title: works.title,
            description: works.description,
            coverUrl: works.coverUrl,
            authorName: users.publicName,
            authorId: users.id,
            views: sql`COALESCE(${viewsSubquery.vCount}, 0)`
        })
        .from(works)
        .leftJoin(users, eq(works.authorId, users.id))
        .leftJoin(viewsSubquery, eq(works.id, viewsSubquery.workId))
        .where(finalWhere);

        // 6. Применяем сортировку
        if (sort === 'popular') {
            query = query.orderBy(desc(sql`COALESCE(${viewsSubquery.vCount}, 0)`), desc(works.id));
        } else if (sort === 'oldest') {
            query = query.orderBy(asc(works.id));
        } else {
            query = query.orderBy(desc(works.id));
        }

        // 7. Получаем финальный список с лимитом
        const worksList = await query.limit(limitPerPage).offset(offset).all();

        return reply.view('pages/works/works.ejs', {
            title: 'Библиотека',
            user: request.session?.user || null,
            worksList,
            allGenres: allGenresList,
            allTags: allTagsList,
            pagination: { total: totalPages, current: currentPage },
            query: { search: search || '', sort: sort || 'newest', genres: selectedGenres, tags: selectedTags }
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка загрузки библиотеки');
    }
});

fastify.get('/authors', async (request, reply) => {
    try {
        const { search, page } = request.query;
        const currentPage = parseInt(page) || 1;
        const limitPerPage = 12;
        const offset = (currentPage - 1) * limitPerPage;

        const searchCondition = search 
            ? sql`(public_name LIKE ${'%' + search + '%'} OR login LIKE ${'%' + search + '%'})`
            : sql`1=1`;

        const totalResult = await db.select({ count: count() })
            .from(users)
            .where(searchCondition)
            .get();

        const totalItems = totalResult?.count || 0;
        const totalPages = Math.ceil(totalItems / limitPerPage);

        const authorsList = await db.select({
            id: users.id,
            login: users.login,
            publicName: users.publicName,
            worksCount: sql` (
                SELECT COUNT(*) 
                FROM works 
                WHERE works.author_id = users.id 
                AND works.is_public = 1
            )`.mapWith(Number)
        })
        .from(users)
        .where(searchCondition)
        .limit(limitPerPage)
        .offset(offset)
        .all();

        return reply.view('pages/authors/authors.ejs', {
            title: 'Поиск авторов',
            user: request.session?.user || null,
            authors: authorsList,
            search: search || '',
            pagination: {
                total: totalPages,
                current: currentPage
            }
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка при поиске авторов');
    }
});

// --- ПРОФИЛЬ АВТОРА ---
fastify.get('/authors/:id', async (request, reply) => {
    try {
        const authorId = parseInt(request.params.id);
        const currentUser = request.session?.user || null;
        const isOwner = currentUser?.id === authorId;
        
        const activeTab = request.query.tab || 'works';
        const currentPage = parseInt(request.query.page) || 1;
        const limitPerPage = 8;
        const offset = (currentPage - 1) * limitPerPage;

        const profile = await db.select().from(users).where(eq(users.id, authorId)).get();
        if (!profile) return reply.code(404).send('Пользователь не найден');

        // УСЛОВИЕ ДЛЯ ВЫБОРКИ РАБОТ: 
        // Если зашел владелец — показываем всё (isPublic true И false).
        // Если гость — только isPublic = true.
        const worksCondition = isOwner 
            ? eq(works.authorId, authorId)
            : and(eq(works.authorId, authorId), eq(works.isPublic, true));

        const [worksCount] = await db.select({ val: count() }).from(works).where(worksCondition);
        
        const authorWorks = await db.select().from(works)
            .where(worksCondition)
            .limit(limitPerPage)
            .offset(activeTab === 'works' ? offset : 0)
            .all();

        const allShelves = await db.select().from(shelves).where(eq(shelves.userId, authorId));
        const shelvesData = {
            reading: { items: [], total: 0, count: 0 },
            completed: { items: [], total: 0, count: 0 },
            bookmarks: { items: [], total: 0, count: 0 }
        };

        for (const shelf of allShelves) {
            const type = shelf.shelfType;
            
            // Считаем количество всегда (для отображения цифр владельцу)
            const [sCount] = await db.select({ val: count() }).from(worksToShelves)
                .where(eq(worksToShelves.shelfId, shelf.id));

            // Загружаем айтемы только если полка публичная ИЛИ зашел владелец
            let shelfWorks = [];
            if (shelf.isPublic || isOwner) {
                shelfWorks = await db.select({
                    id: works.id, 
                    title: works.title, 
                    coverUrl: works.coverUrl,
                    authorName: users.publicName, 
                    authorId: users.id,
                    isPublic: works.isPublic
                })
                .from(worksToShelves)
                .innerJoin(works, eq(worksToShelves.workId, works.id))
                .innerJoin(users, eq(works.authorId, users.id))
                .where(eq(worksToShelves.shelfId, shelf.id))
                .limit(limitPerPage)
                .offset(activeTab === type ? offset : 0)
                .all();
            }

            // Передаем статус isPublic в объект, чтобы EJS знал, показывать плашку или нет
            shelvesData[type] = {
                items: shelfWorks,
                total: Math.ceil((sCount?.val || 0) / limitPerPage),
                count: sCount?.val || 0,
                isPublic: !!shelf.isPublic // Важно!
            };
        }

        return reply.view('pages/authors/author.ejs', {
            title: profile.publicName,
            user: currentUser,
            profile,
            isOwner,
            authorWorks: {
                items: authorWorks,
                total: Math.ceil((worksCount?.val || 0) / limitPerPage),
                count: worksCount?.val || 0
            },
            shelvesData,
            activeTab,
            currentPage
        });
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send('Ошибка сервера');
    }
});

// РОУТ ДЛЯ УДАЛЕНИЯ ИЗ ВСЕХ ПОЛОК ПОЛЬЗОВАТЕЛЯ
fastify.post('/shelves/remove', async (request, reply) => {
    const { workId } = request.body;
    const currentUser = request.session?.user;

    if (!currentUser) return reply.code(401).send({ error: 'Нужна авторизация' });

    try {
        // Находим ID всех полок, принадлежащих пользователю
        const userShelvesIds = db.select({ id: shelves.id })
            .from(shelves)
            .where(eq(shelves.userId, currentUser.id));

        // Удаляем записи о книге из этих полок
        await db.delete(worksToShelves)
            .where(and(
                eq(worksToShelves.workId, workId),
                sql`${worksToShelves.shelfId} IN ${userShelvesIds}`
            ))
            .run();

        return { success: true };
    } catch (err) {
        fastify.log.error(err);
        return reply.code(500).send({ error: 'Ошибка сервера' });
    }
});

// --- СЕКЦИЯ НАСТРОЕК (SETTINGS) ---
fastify.register(async (instance) => {
    
    const deleteOldFile = async (url) => {
        if (url && !url.includes('default') && url.startsWith('/uploads/')) {
            const oldPath = path.join(__dirname, '../public', url);
            try { await fs.unlink(oldPath); } catch (err) { instance.log.error(err); }
        }
    };

    instance.addHook('preHandler', async (request, reply) => {
        if (!request.session?.user) return reply.redirect('/auth/login');
    });

    // 1. ПРОФИЛЬ
    instance.get('/profile', async (request, reply) => {
        const user = await db.select().from(users).where(eq(users.id, request.session.user.id)).get();
        return reply.view('pages/settings/profile.ejs', { title: 'Профиль', user });
    });

    instance.post('/profile', async (request, reply) => {
        const userId = request.session.user.id;
        const user = await db.select().from(users).where(eq(users.id, userId)).get();
        const parts = request.parts();
        let updateData = {};
        let avatarAction = 'keep';
        let newAvatarUrl = user.avatarUrl;

        for await (const part of parts) {
            if (part.file && part.filename) {
                const fileName = `avatar_${userId}_${Date.now()}.webp`;
                const uploadDir = path.join(__dirname, '../public/uploads/avatars');
                try {
                    await fs.mkdir(uploadDir, { recursive: true });
                    await sharp(await part.toBuffer()).resize(400, 400, { fit: 'cover' }).webp().toFile(path.join(uploadDir, fileName));
                    newAvatarUrl = `/uploads/avatars/${fileName}`;
                    avatarAction = 'update';
                } catch (err) { instance.log.error(err); }
            } else if (part.fieldname === 'avatar_action') {
                avatarAction = part.value;
            } else if (part.fieldname) {
                updateData[part.fieldname] = part.value;
            }
        }

        if (avatarAction === 'update') await deleteOldFile(user.avatarUrl);
        else if (avatarAction === 'delete') { await deleteOldFile(user.avatarUrl); newAvatarUrl = '/assets/default-avatar.png'; }

        updateData.avatarUrl = newAvatarUrl;
        await db.update(users).set(updateData).where(eq(users.id, userId)).run();
        request.session.user = { ...request.session.user, ...updateData };
        return reply.redirect('/settings/profile');
    });

    // 2. АККАУНТ
    instance.get('/account', async (request, reply) => {
        const user = await db.select().from(users).where(eq(users.id, request.session.user.id)).get();
        const error = request.session.error;
        request.session.error = null; 
        return reply.view('pages/settings/account.ejs', { title: 'Аккаунт', user, error });
    });

    // СМЕНА ЛОГИНА (Исправлено: login вместо username)
    instance.post('/username', async (request, reply) => {
        const userId = request.session.user.id;
        const parts = request.parts();
        let data = {};
        for await (const part of parts) { if (part.fieldname) data[part.fieldname] = part.value; }

        try {
            const user = await db.select().from(users).where(eq(users.id, userId)).get();
            const isMatch = await bcrypt.compare(data.password, user.passwordHash);

            if (!isMatch) {
                request.session.error = "Неверный пароль для подтверждения";
                return reply.redirect('/settings/account');
            }

            // Проверка уникальности нового логина
            const existing = await db.select().from(users).where(eq(users.login, data.login)).get();
            if (existing && existing.id !== userId) {
                request.session.error = "Этот логин уже занят";
                return reply.redirect('/settings/account');
            }

            // ОБНОВЛЕНИЕ: используем поле 'login' из вашей схемы
            await db.update(users).set({ login: data.login }).where(eq(users.id, userId)).run();
            request.session.user.login = data.login;
            
            return reply.redirect('/settings/account');
        } catch (err) {
            instance.log.error(err);
            request.session.error = "Ошибка базы данных";
            return reply.redirect('/settings/account');
        }
    });

    // СМЕНА EMAIL
        instance.post('/account', async (request, reply) => {
            const userId = request.session.user.id;
            const parts = request.parts();
            let data = {};
            for await (const part of parts) { if (part.fieldname) data[part.fieldname] = part.value; }

            try {
                const user = await db.select().from(users).where(eq(users.id, userId)).get();
                const isMatch = await bcrypt.compare(data.currentPassword, user.passwordHash);
                
                if (!isMatch) { 
                    request.session.error = "Неверный пароль"; 
                    return reply.redirect('/settings/account'); 
                }

                // ПРОВЕРКА: не занята ли почта
                const existing = await db.select().from(users).where(eq(users.email, data.email)).get();
                if (existing && existing.id !== userId) {
                    request.session.error = "Эта электронная почта уже привязана к другому аккаунту";
                    return reply.redirect('/settings/account');
                }

                await db.update(users).set({ email: data.email }).where(eq(users.id, userId)).run();
                request.session.user.email = data.email;
                return reply.redirect('/settings/account');
            } catch (err) {
                instance.log.error(err);
                request.session.error = "Ошибка при обновлении почты";
                return reply.redirect('/settings/account');
            }
        });

    // СМЕНА ПАРОЛЯ
    instance.post('/password', async (request, reply) => {
        const userId = request.session.user.id;
        const parts = request.parts();
        let data = {};
        for await (const part of parts) { if (part.fieldname) data[part.fieldname] = part.value; }

        try {
            const user = await db.select().from(users).where(eq(users.id, userId)).get();
            const isMatch = await bcrypt.compare(data.oldPassword, user.passwordHash);
            if (!isMatch) { request.session.error = "Старый пароль неверный"; return reply.redirect('/settings/account'); }

            const newHash = await bcrypt.hash(data.newPassword, 10);
            await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId)).run();
            return reply.redirect('/settings/account');
        } catch (err) {
            request.session.error = "Ошибка сервера";
            return reply.redirect('/settings/account');
        }
    });

    // УДАЛЕНИЕ АККАУНТА
    instance.post('/delete-account', async (request, reply) => {
        const userId = request.session.user.id;
        const parts = request.parts();
        let data = {};
        for await (const part of parts) { if (part.fieldname) data[part.fieldname] = part.value; }

        try {
            const user = await db.select().from(users).where(eq(users.id, userId)).get();
            const isMatch = await bcrypt.compare(data.password, user.passwordHash);

            if (!isMatch) {
                request.session.error = "Неверный пароль. Удаление отменено.";
                return reply.redirect('/settings/account');
            }

            await deleteOldFile(user.avatarUrl);
            await db.delete(users).where(eq(users.id, userId)).run();
            
            request.session.destroy();
            return reply.redirect('/');
        } catch (err) {
            instance.log.error(err);
            request.session.error = "Ошибка при удалении аккаунта";
            return reply.redirect('/settings/account');
        }
    });

    // 3. ПРИВАТНОСТЬ
    instance.get('/privacy', async (request, reply) => {
        const user = await db.select().from(users).where(eq(users.id, request.session.user.id)).get();
        const userShelves = await db.select().from(shelves).where(eq(shelves.userId, user.id)).all();
        return reply.view('pages/settings/privacy.ejs', { title: 'Приватность', user, userShelves });
    });

    instance.post('/privacy', async (request, reply) => {
        const userId = request.session.user.id;
        const parts = request.parts();
        const shelfUpdates = {};
        for await (const part of parts) {
            if (part.fieldname?.startsWith('shelf_')) {
                shelfUpdates[part.fieldname.split('_')[1]] = part.value === 'true';
            }
        }
        for (const [id, isPublic] of Object.entries(shelfUpdates)) {
            await db.update(shelves).set({ isPublic }).where(and(eq(shelves.id, parseInt(id)), eq(shelves.userId, userId))).run();
        }
        return reply.redirect('/settings/privacy');
    });

}, { prefix: '/settings' });

async function checkWorkOwnership(db, workId, userId) {
    const work = await db.select().from(works).where(eq(works.id, workId)).get();
    return work && work.authorId === userId;
}

fastify.get('/works/:id/chapters/new', async (request, reply) => {
    const userId = request.session?.user?.id;
    if (!userId) return reply.redirect('/auth/login');

    const workId = parseInt(request.params.id);
    if (!await checkWorkOwnership(db, workId, userId)) return reply.code(403).send('Доступ запрещен');

    const work = await db.select().from(works).where(eq(works.id, workId)).get();
    
    // Находим максимальную текущую позицию
    const [lastChapter] = await db.select({ maxPos: sql`MAX(${chapters.position})` })
        .from(chapters).where(eq(chapters.workId, workId));
    
    return reply.view('pages/chapters/chapter-form.ejs', {
        workId,
        workTitle: work.title,
        maxPosition: lastChapter?.maxPos || 0,
        user: request.session.user
    });
});

// --- POST: СОЗДАНИЕ ГЛАВЫ ---
fastify.post('/works/:id/chapters/new', async (request, reply) => {
    const userId = request.session?.user?.id;
    const workId = parseInt(request.params.id);
    const { title, content, position } = request.body;
    const newPos = parseInt(position);

    if (!await checkWorkOwnership(db, workId, userId)) return reply.code(403).send('Доступ запрещен');

    // ЛОГИКА СДВИГА: Увеличиваем позицию всех глав, которые >= новой позиции
    await db.update(chapters)
        .set({ position: sql`${chapters.position} + 1` })
        .where(and(eq(chapters.workId, workId), sql`${chapters.position} >= ${newPos}`))
        .run();

    await db.insert(chapters).values({
        workId,
        title,
        content,
        position: newPos
    }).run();

    return reply.redirect(`/works/${workId}`);
});

fastify.get('/works/:id/chapters/:chapterId', async (request, reply) => {
    const { id: workId, chapterId } = request.params;
    const currentUser = request.session.user || null; // Получаем юзера
    const page = parseInt(request.query.page) || 1;   // Текущая страница пагинации
    const limit = 10;

    const [currentChapter] = await db.select()
        .from(chapters)
        .where(eq(chapters.id, parseInt(chapterId)));

    if (!currentChapter) return reply.status(404).send('Глава не найдена');

    const [work] = await db.select().from(works).where(eq(works.id, parseInt(workId)));

    const allChapters = await db.select({ id: chapters.id })
        .from(chapters)
        .where(eq(chapters.workId, parseInt(workId)))
        .orderBy(asc(chapters.position));

    const currentIndex = allChapters.findIndex(ch => ch.id === currentChapter.id);
    const prevId = allChapters[currentIndex - 1]?.id || null;
    const nextId = allChapters[currentIndex + 1]?.id || null;

    if (currentUser) {
        await db.insert(workViews)
            .values({ workId: parseInt(workId), userId: currentUser.id })
            .onConflictDoNothing();
    }

    // --- ДОБАВЛЕННЫЙ БЛОК ДЛЯ КОММЕНТАРИЕВ ---
    const { items: commentsList, total: commentsTotal } = await getCommentsWithData(
        parseInt(workId), 
        parseInt(chapterId), 
        currentUser?.id, 
        page, 
        limit
    );

    return reply.view('pages/chapters/chapter.ejs', {
        work,
        chapter: currentChapter,
        prevId,
        nextId,
        user: currentUser,
        // Передаем недостающие переменные:
        comments: commentsList,
        commentsTotal: commentsTotal,
        currentPage: page,
        totalPages: Math.ceil(commentsTotal / limit)
    });
});

// --- GET: РЕДАКТИРОВАНИЕ ГЛАВЫ ---
fastify.get('/works/:id/chapters/:chapterId/edit', async (request, reply) => {
    const userId = request.session?.user?.id;
    const workId = parseInt(request.params.id);
    const chapterId = parseInt(request.params.chapterId);

    if (!userId || !await checkWorkOwnership(db, workId, userId)) return reply.code(403).send('Доступ запрещен');

    const work = await db.select().from(works).where(eq(works.id, workId)).get();
    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
    
    const [countRes] = await db.select({ total: count() }).from(chapters).where(eq(chapters.workId, workId));

    return reply.view('pages/chapters/chapter-form.ejs', {
        workId,
        workTitle: work.title,
        chapter,
        maxPosition: countRes.total,
        user: request.session.user
    });
});

// --- POST: ИЗМЕНЕНИЕ ГЛАВЫ ---
fastify.post('/works/:id/chapters/:chapterId/edit', async (request, reply) => {
    const userId = request.session?.user?.id;
    const workId = parseInt(request.params.id);
    const chapterId = parseInt(request.params.chapterId);
    const { title, content, position } = request.body;
    const newPos = parseInt(position);

    if (!await checkWorkOwnership(db, workId, userId)) return reply.code(403).send('Доступ запрещен');

    const oldChapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
    const oldPos = oldChapter.position;

    if (newPos !== oldPos) {
        // Если перемещаем главу вверх (например с 5 на 2)
        if (newPos < oldPos) {
            await db.update(chapters)
                .set({ position: sql`${chapters.position} + 1` })
                .where(and(eq(chapters.workId, workId), sql`${chapters.position} >= ${newPos}`, sql`${chapters.position} < ${oldPos}`))
                .run();
        } 
        // Если перемещаем вниз (например с 2 на 5)
        else {
            await db.update(chapters)
                .set({ position: sql`${chapters.position} - 1` })
                .where(and(eq(chapters.workId, workId), sql`${chapters.position} <= ${newPos}`, sql`${chapters.position} > ${oldPos}`))
                .run();
        }
    }

    await db.update(chapters)
        .set({ title, content, position: newPos })
        .where(eq(chapters.id, chapterId))
        .run();

    return reply.redirect(`/works/${workId}`);
});

// --- GET: УДАЛЕНИЕ ГЛАВЫ ---
fastify.get('/works/:id/chapters/:chapterId/delete', async (request, reply) => {
    const userId = request.session?.user?.id;
    const workId = parseInt(request.params.id);
    const chapterId = parseInt(request.params.chapterId);

    if (!userId || !await checkWorkOwnership(db, workId, userId)) return reply.code(403).send('Доступ запрещен');

    const chapterToDelete = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
    
    await db.delete(chapters).where(eq(chapters.id, chapterId)).run();

    // Сдвигаем все последующие главы назад, чтобы не было дырок
    await db.update(chapters)
        .set({ position: sql`${chapters.position} - 1` })
        .where(and(eq(chapters.workId, workId), sql`${chapters.position} > ${chapterToDelete.position}`))
        .run();

    return reply.redirect(`/works/${workId}`);
});

// --- ВСПОМОГАТЕЛЬНЫЙ МЕТОД ДЛЯ ПОЛУЧЕНИЯ КОММЕНТАРИЕВ ---
async function getCommentsWithData(workId, chapterId, currentUserId, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const baseQuery = db.select({
        id: comments.id,
        content: comments.content,
        userId: comments.userId,
        createdAt: comments.createdAt,
        userPublicName: users.publicName,
        likesCount: sql`(SELECT count(*) FROM ${commentLikes} WHERE ${commentLikes.commentId} = ${comments.id})`,
        userHasLiked: currentUserId 
            ? sql`EXISTS(SELECT 1 FROM ${commentLikes} WHERE ${commentLikes.commentId} = ${comments.id} AND ${commentLikes.userId} = ${currentUserId})` 
            : sql`0`
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .offset(offset);

    // Условие фильтрации
    const condition = chapterId 
        ? eq(comments.chapterId, chapterId) 
        : and(eq(comments.workId, workId), sql`${comments.chapterId} IS NULL`);

    const result = await baseQuery.where(condition).all();

    // Получаем общее количество для этой ветки
    const totalResult = await db.select({ value: count() })
        .from(comments)
        .where(condition)
        .get();

    return { items: result, total: totalResult.value };
}

// Унифицированное создание комментария
fastify.post('/comments', async (request, reply) => {
    const { content, workId, chapterId } = request.body;
    const user = request.session.user;

    if (!user) return reply.code(401).send({ error: 'ТРЕБУЕТСЯ АВТОРИЗАЦИЯ' });
    if (!content || content.trim().length < 2) return reply.code(400).send({ error: 'ПУСТОЙ ОТПЕЧАТОК' });

    await db.insert(comments).values({
        userId: user.id,
        workId: parseInt(workId),
        chapterId: chapterId ? parseInt(chapterId) : null,
        content: content.trim()
    }).run();

    return reply.send({ success: true });
});

// Лайк/Удаление лайка (Toggle)
fastify.post('/comments/:id/like', async (request, reply) => {
    const commentId = parseInt(request.params.id);
    const user = request.session.user;

    if (!user) return reply.code(401).send({ error: 'Авторизуйтесь' });

    // Проверяем, нет ли уже лайка
    const existing = await db.select().from(commentLikes)
        .where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, user.id)))
        .get();

    if (existing) {
        await db.delete(commentLikes).where(eq(commentLikes.id, existing.id)).run();
    } else {
        // Запрещаем лайкать свои комменты (опционально, но логично для "Кукольника")
        const comment = await db.select().from(comments).where(eq(comments.id, commentId)).get();
        if (comment.userId === user.id) return reply.code(400).send({ error: 'Самолюбование запрещено' });

        await db.insert(commentLikes).values({ commentId, userId: user.id }).run();
    }

    const newCount = await db.select({ val: count() }).from(commentLikes).where(eq(commentLikes.commentId, commentId)).get();
    return reply.send({ likes: newCount.val, isLiked: !existing });
});

// Удаление комментария
fastify.delete('/comments/:id', async (request, reply) => {
    const commentId = parseInt(request.params.id);
    const user = request.session.user;

    if (!user) return reply.code(401).send();

    const comment = await db.select({
        c: comments,
        w: works
    })
    .from(comments)
    .innerJoin(works, eq(comments.workId, works.id))
    .where(eq(comments.id, commentId))
    .get();

    if (!comment) return reply.code(404).send();

    // Права: автор коммента ИЛИ автор произведения
    const canDelete = comment.c.userId === user.id || comment.w.authorId === user.id;

    if (!canDelete) return reply.code(403).send();

    await db.delete(comments).where(eq(comments.id, commentId)).run();
    return reply.send({ success: true });
});

fastify.listen({ 
  port: process.env.PORT || 3000, 
  host: '0.0.0.0' 
}, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log('Сервер запущен');
});
