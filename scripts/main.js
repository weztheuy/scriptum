async function loadBooks() {
  const response = await fetch('/data/books.json');
  const data = await response.json();

  renderBooks(data.popular, 'popular-container');
  renderBooks(data.new, 'new-container');
  renderBooks(data.updates, 'updates-container');
}

function renderBooks(list, containerId) {
    const container = document.getElementById(containerId);
    list.forEach(book => {
        // Создаем HTML для информации о последней главе, если она существует
        let chapterInfo = '';
        if (book.latest_chapter && book.chapter_url) { // Проверяем наличие обоих полей
            chapterInfo = `
                <p class="latest-chapter">
                    <a href="${book.chapter_url}">${book.latest_chapter}</a>
                </p>`;
        } else if (book.latest_chapter) { // Если URL нет, но название главы есть
             chapterInfo = `<p class="latest-chapter">${book.latest_chapter}</p>`;
        }

        const li = document.createElement('li');
        li.innerHTML = `
            <article>
                <figure class="card-cover">
                    <img src="${book.cover}" alt="Обложка книги ${book.title}">
                </figure>
                
                <div class="card-content">
                    <h3><a href="${book.work_url}">${book.title}</a></h3>
                    <p>Автор: <a href="${book.author_url}">${book.author}</a></p>
                    
                    ${chapterInfo} 
                    
                    <p class="description">${book.description}</p>
                </div>
            </article>
        `;
        container.appendChild(li);
    });
}

loadBooks();