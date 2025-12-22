/
├── /public                   # Статические ресурсы
│   ├── /css                  # tailwind.css (скомпилированный)
│   ├── /js                   # htmx.min.js, alpine.min.js
│   └── /uploads              # /covers, /avatars
├── /src
│   ├── /shared               # Общие ресурсы проекта
│   │   ├── db.js             # Инициализация SQLite и Drizzle
│   │   ├── schema.js         # Описание всех таблиц (Users, Works, Chapters, и т.д.)
│   │   ├── markdown.js       # Конвертер Markdown -> HTML
│   │   └── mailer.js         # Сервис отправки кодов подтверждения
│   ├── /modules
│   │   ├── /auth             # Вход, Регистрация + модалка подтверждения почты
│   │   ├── /works            # Главная (Новинки), Библиотека (Фильтры), Визитка книги
│   │   ├── /authors          # Поиск авторов, Страница автора + Shelves
│   │   ├── /chapters         # Чтение главы, логика позиций (position)
│   │   ├── /comments         # Линейные ветки комментариев, Лайки, Пагинация
│   │   ├── /settings         # Профиль, Приватность, Безопасность (Удаление + Код)
│   │   └── /downloader       # Генерация файлов (EPUB/PDF) по выбору глав
│   ├── /views                # Шаблоны (EJS)
│   │   ├── /pages
│   │   │   ├── /auth         # login.ejs, register.ejs
│   │   │   ├── /works        # home.ejs, library.ejs, work-view.ejs
│   │   │   ├── /authors      # search.ejs, author-profile.ejs
│   │   │   ├── /chapters     # reader.ejs
│   │   │   └── /settings     # profile.ejs, privacy.ejs, security.ejs
│   │   ├── /partials         # Переиспользуемые фрагменты
│   │   │   ├── /comments     # list.ejs, item.ejs (HTMX фрагменты)
│   │   │   ├── /cards        # work-card.ejs, author-card.ejs
│   │   │   └── /ui           # multi-select.ejs, modal-confirm.ejs
│   │   └── layout.ejs        # Базовый скелет (HTML head, nav, footer)
│   └── server.js             # Точка входа (Fastify сервер)
├── tailwind.config.js        # Конфигурация стилей
├── .env                      # Путь к БД и секреты
└── package.json