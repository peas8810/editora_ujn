import { loadBooks, el, bookCover } from "./acervo.js";
import { normalizedIsbn } from "./isbn.js";

const byId = (id) => document.getElementById(id);
const list = byId("books");
const search = byId("query");
const category = byId("category");
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
let books = [];

function showState(title, copy) {
  byId("state").hidden = !title;
  byId("state-title").textContent = title;
  byId("state-copy").textContent = copy;
}

function bookCard(book) {
  const card = el("article", "", "card");
  const body = el("div", "", "card-body");
  body.append(
    el("p", [book.category, book.year].filter(Boolean).join(" · "), "tag"),
    el("h3", book.title),
    el("p", book.authors, "muted")
  );
  const link = el("a", "Ver livro →", "card-link");
  link.href = `livro/?isbn=${encodeURIComponent(book.isbn)}`;
  link.setAttribute("aria-label", `Ver livro ${book.title}`);
  card.append(bookCover(book), body, link);
  return card;
}

function render() {
  const term = normalize(search.value.trim());
  const isbn = normalizedIsbn(term) || term.replace(/[\s-]/g, "");
  const isIsbnSearch = /^\d+[\dx]?$/.test(isbn);
  const filtered = books.filter((book) => {
    const text = [book.title, book.authors, book.isbn, ...book.records.map((record) => record.code)].join(" ");
    return (!category.value || book.category === category.value)
      && (normalize(text).includes(term) || (isIsbnSearch && book.isbn.includes(isbn)));
  });
  list.replaceChildren(...filtered.map(bookCard));
  byId("count").hidden = false;
  byId("count").textContent = filtered.length === 1 ? "1 obra" : `${filtered.length} obras`;
  showState(filtered.length ? "" : "Nenhuma obra encontrada", "Tente buscar outro título, autor ou código.");
}

search.addEventListener("input", render);
category.addEventListener("change", render);

try {
  books = await loadBooks();
  if (books.length) {
    const categories = [...new Set(books.map((book) => book.category).filter(Boolean))];
    categories.sort((a, b) => a.localeCompare(b, "pt-BR"));
    for (const item of categories) category.add(new Option(item, item));
    byId("filters").hidden = false;
    render();
  } else {
    showState("Nenhuma obra publicada", "As próximas publicações serão apresentadas aqui.");
  }
} catch {
  showState("Catálogo temporariamente indisponível", "Atualize a página para tentar novamente.");
}
