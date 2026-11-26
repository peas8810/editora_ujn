import { loadBooks, el, externalLink, bookCover } from "../acervo.js";
import { normalizedIsbn } from "../isbn.js";

const article = document.getElementById("obra");
const status = document.getElementById("estado");

function showBook(book) {
  document.title = `${book.title} | Editora UJN`;
  const canonical = el("link");
  canonical.rel = "canonical";
  canonical.href = `https://publisherujn.com/editora/livro/?isbn=${book.isbn}`;
  document.head.append(canonical);

  const info = el("div", "", "obra-info");
  const title = el("h1", book.title);
  title.id = "titulo-obra";
  info.append(el("p", book.category || "Editora UJN", "tag"), title);
  if (book.authors) info.append(el("p", book.authors, "muted"));

  const actions = el("div", "", "obra-acoes");
  const pdf = externalLink("Ler livro ↗", book.documentUrl, "primary");
  const registry = externalLink("Consultar registro ↗", book.isbnUrl, "outline");
  for (const link of [pdf, registry]) {
    if (link) actions.append(link);
  }
  info.append(actions);

  const details = el("dl");
  function addRow(label, value, links = []) {
    if (!value && !links.length) return;
    const definition = el("dd", value);
    for (const link of links) definition.append(link);
    details.append(el("dt", label), definition);
  }
  addRow("ISBN", book.isbn);
  addRow("Edição", book.edition);
  addRow("Formato", book.format);
  addRow("Ano", book.year);
  addRow("Páginas", book.pages);
  for (const record of book.records) {
    const recordLink = externalLink("Consultar ↗", record.url);
    const fileLink = externalLink("Documento ↗", record.documentUrl);
    addRow(record.label, record.code, [recordLink, fileLink].filter(Boolean));
  }
  info.append(details);
  if (book.description) {
    info.append(el("h2", "Sinopse"), el("p", book.description, "detail-copy"));
  }
  article.append(bookCover(book), info);
  article.hidden = false;
  status.hidden = true;
}

const isbn = normalizedIsbn(new URLSearchParams(location.search).get("isbn"));
try {
  const book = isbn ? (await loadBooks()).find((item) => item.isbn === isbn) : null;
  if (book) showBook(book);
  else status.textContent = "Obra não encontrada no catálogo.";
} catch {
  status.textContent = "Catálogo temporariamente indisponível. Atualize a página para tentar novamente.";
}
