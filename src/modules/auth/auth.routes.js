import bcrypt from 'bcrypt';
import { users, shelves } from '../../shared/schema.js';
import { db } from '../../shared/db.js';
import { or, eq } from 'drizzle-orm';

export default async function authRoutes(fastify) {
    // Страница регистрации
    fastify.get('/register', async (request, reply) => {
        return reply.view('pages/auth/register.ejs', { title: 'РЕГИСТРАЦИЯ' });
    });

    // Шаг 1: Получение данных и "отправка" кода
    fastify.post('/register', async (request, reply) => {
        const { login, email, password } = request.body;

        // 1. Проверка на длину
        if (!password || password.length < 8) {
            return reply.code(400).send({ error: 'ПАРОЛЬ СЛИШКОМ КОРОТКИЙ' });
        }

        // 2. Проверка на запрещенные символы (дублируем логику фронтенда)
        const forbiddenChars = /[^A-Za-z0-9@$!%*?&]/;
        if (forbiddenChars.test(password)) {
            return reply.code(400).send({ error: 'ПАРОЛЬ СОДЕРЖИТ НЕДОПУСТИМЫЕ СИМВОЛЫ' });
        }

        // Проверка, не занят ли Email или Логин
        const existingUser = await db.select().from(users)
            .where(eq(users.email, email)).get();
        
        if (existingUser) {
            return reply.code(400).send({ error: 'ПОЛЬЗОВАТЕЛЬ С ТАКИМ EMAIL УЖЕ СУЩЕСТВУЕТ' });
        }

        const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();
        const passwordHash = await bcrypt.hash(password, 10);

        request.session.tempUser = { login, email, passwordHash, verificationCode };

        console.log(`\n=== EMAIL СИМУЛЯЦИЯ ===\nКод для ${email}: ${verificationCode}\n========================\n`);

        return reply.send({ success: true });
    });

    // Шаг 2: Проверка кода и создание записи в БД
    fastify.post('/verify', async (request, reply) => {
        const { code } = request.body;
        const temp = request.session.tempUser;

        if (!temp || code !== temp.verificationCode) {
            return reply.code(400).send({ error: 'НЕВЕРНЫЙ КОД' });
        }

        // Сохраняем в базу
        const [newUser] = await db.insert(users).values({
            login: temp.login,
            email: temp.email,
            passwordHash: temp.passwordHash,
            publicName: temp.login.toUpperCase(),
            emailVerified: true
        }).returning();

        // Создаем базовые полки
        const baseShelves = [
            { userId: newUser.id, shelfType: 'reading', isPublic: true },
            { userId: newUser.id, shelfType: 'completed', isPublic: true },
            { userId: newUser.id, shelfType: 'bookmarks', isPublic: true }
        ];
        await db.insert(shelves).values(baseShelves);

        // Авторизуем пользователя
        request.session.user = newUser;
        delete request.session.tempUser;

        return reply.send({ success: true });
    });

    // Страница входа (GET)
    fastify.get('/login', async (request, reply) => {
        return reply.view('pages/auth/login.ejs', { title: 'ВХОД' });
    });

    // Обработка входа (POST)
    fastify.post('/login', async (request, reply) => {
        const { identity, password } = request.body; // identity это либо логин, либо email

        // 1. Ищем пользователя по логину ИЛИ почте
        const user = await db.select().from(users)
            .where(or(eq(users.login, identity), eq(users.email, identity)))
            .get();

        if (!user) {
            return reply.code(400).send({ error: 'ПОЛЬЗОВАТЕЛЬ НЕ НАЙДЕН' });
        }

        // 2. Проверяем пароль
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return reply.code(400).send({ error: 'НЕВЕРНЫЙ ПАРОЛЬ' });
        }

        // 3. Создаем сессию
        request.session.user = user;

        return reply.send({ success: true });
    });

    fastify.get('/logout', async (request, reply) => {
        request.session.destroy();
        return reply.redirect('/');
    });
}