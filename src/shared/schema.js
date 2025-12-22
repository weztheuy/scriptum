import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- ПОЛЬЗОВАТЕЛИ ---
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  login: text('login').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  publicName: text('public_name').notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('description'),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// --- ЖАНРЫ И МЕТКИ ---
export const genres = sqliteTable('genres', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

// --- ПРОИЗВЕДЕНИЯ ---
export const works = sqliteTable('works', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  coverUrl: text('cover_url'),
  isPublic: integer('is_public', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// --- ГЛАВЫ ---
export const chapters = sqliteTable('chapters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workId: integer('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// --- КОММЕНТАРИИ ---
export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  workId: integer('work_id').references(() => works.id, { onDelete: 'cascade' }),
  chapterId: integer('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// --- ЛАЙКИ К КОММЕНТАРИЯМ ---
export const commentLikes = sqliteTable('comment_likes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  commentId: integer('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => ({
  unq: uniqueIndex('unique_comment_like').on(t.commentId, t.userId),
}));

// --- ВСПОМОГАТЕЛЬНЫЕ ТАБЛИЦЫ ---

export const shelves = sqliteTable('shelves', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  shelfType: text('shelf_type').notNull(),
  isPublic: integer('is_public', { mode: 'boolean' }).default(true),
});

export const workViews = sqliteTable('work_views', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workId: integer('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (t) => ({
  unq: uniqueIndex('unique_view').on(t.workId, t.userId),
}));

export const worksToShelves = sqliteTable('works_to_shelves', {
  workId: integer('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  shelfId: integer('shelf_id').notNull().references(() => shelves.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.workId, t.shelfId] }),
}));

export const worksToGenres = sqliteTable('works_to_genres', {
  workId: integer('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  genreId: integer('genre_id').notNull().references(() => genres.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.workId, t.genreId] }),
}));

export const worksToTags = sqliteTable('works_to_tags', {
  workId: integer('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.workId, t.tagId] }),
}));

export const ratings = sqliteTable('ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workId: integer('work_id').notNull().references(() => works.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: integer('score').notNull(),
}, (t) => ({
  unq: uniqueIndex('unique_rating').on(t.workId, t.userId),
}));