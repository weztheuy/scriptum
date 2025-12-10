async function loadBooks() {
    // Загрузка данных из JSON
    const response = await fetch('/data/books.json');
    const data = await response.json();

    // Рендеринг книг в соответствующие контейнеры
    renderBooks(data.new, 'new-container');
    renderBooks(data.updates, 'updates-container');
}

function renderBooks(list, containerId) {
    const container = document.getElementById(containerId);
    const fragment = document.createDocumentFragment();
    list.forEach(book => {
        // Формируем информацию о последней главе для секции "Обновления"
        let chapterInfo = '';
        if (book.latest_chapter && book.chapter_url) {
            chapterInfo = `
                <a class="book-chapter" href="${book.chapter_url}">${book.latest_chapter}</a>`;
        }
        
        // Определяем URL автора: если он есть, используем его, иначе "#"
        const authorUrl = book.author_url || '#';

        const li = document.createElement('li');
        li.innerHTML = `
            <article>
                <figure class="card-cover">
                    <img src="${book.cover}" alt="${book.title} - обложка">
                </figure>
                
                <div class="card-content">
                    <a class="book-title" href="${book.work_url}">${book.title}</a>
                    <a class="book-author" href="${authorUrl}">${book.author}</a>
                    
                    ${chapterInfo}
                </div>
            </article>
        `;
        fragment.appendChild(li);
    });

    container.appendChild(fragment);
}

loadBooks();