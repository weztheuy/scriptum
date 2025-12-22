import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/shared/schema.js', // Путь к вашим схемам
  out: './drizzle',                 // Папка для миграций
  dialect: 'sqlite',                // Используем SQLite
  dbCredentials: {
    url: 'file:dev.db',             // Имя файла базы данных
  },
});