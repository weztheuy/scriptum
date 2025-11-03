async function loadBooks() {
    // Загрузка данных из JSON
    const response = await fetch('/data/books.json');
    const data = await response.json();

    // Рендеринг книг в соответствующие контейнеры
    renderBooks(data.popular, 'popular-container');
    renderBooks(data.new, 'new-container');
    renderBooks(data.updates, 'updates-container');
}

function renderBooks(list, containerId) {
    const container = document.getElementById(containerId);
    list.forEach(book => {
        // Формируем информацию о последней главе для секции "Обновления"
        let chapterInfo = '';
        if (book.latest_chapter && book.chapter_url) {
            chapterInfo = `
                <p class="latest-chapter"><a href="${book.chapter_url}">${book.latest_chapter}</a></p>`;
        }
        
        // Определяем URL автора: если он есть, используем его, иначе "#"
        const authorUrl = book.author_url || '#';

        const li = document.createElement('li');
        li.innerHTML = `
            <article>
                <figure class="card-cover">
                    <img src="${book.cover}" alt="Обложка книги ${book.title}">
                </figure>
                
                <div class="card-content">
                    <h3><a href="${book.work_url}">${book.title}</a></h3>
                    <p class="author">Автор: <a href="${authorUrl}">${book.author}</a></p>
                    
                    ${chapterInfo} 
                    
                    <p class="description">${book.description}</p>
                </div>
            </article>
        `;
        container.appendChild(li);
    });
}

loadBooks();