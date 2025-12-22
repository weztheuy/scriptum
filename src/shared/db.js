import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';

// Создаем клиент для работы с локальным файлом SQLite
const client = createClient({ 
    url: 'file:dev.db' 
});

// Инициализируем Drizzle с нашей схемой
export const db = drizzle(client, { schema });

// Экспортируем схему для удобного доступа в модулях
export * from './schema.js';