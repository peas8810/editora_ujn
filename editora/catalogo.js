import { endpoint } from "./config.js";

const byId = (id) => document.getElementById(id);
const list = byId("books");
const search = byId("query");
const category = byId("category");
const details = byId("details");
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
let books = [];

function el(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function showState(title, copy) {
  byId("state").hidden = !title;
  byId("state-title").textContent = title;
  byId("state-copy").textContent = copy;
}

function safeLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function externalLink(text, value, className) {
  const href = safeLink(value);
  if (!href) return null;
  const link = el("a", text, className);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function showDetails(book) {
  const content = byId("detail-content");
  const title = el("h2", book.title);
  title.id = "book-title";
  content.replaceChildren(el("p", book.category, "tag"), title, el("p", book.authors, "muted"));
  if (book.coverUrl) content.append(bookCover(book));
  if (book.description) content.append(el("p", book.description, "detail-copy"));

  const metadata = el("dl");
  const addRow = (label, value, url) => {
    if (!value) return;
    const definition = el("dd");
    definition.append(externalLink(String(value), url) || String(value));
    metadata.append(el("dt", label), definition);
  };
  addRow("Ano", book.year);
  addRow("Páginas", book.pages);
  for (const record of book.records || []) addRow(record.label, record.code || "Consultar registro", record.url);
  if (metadata.childElementCount) content.append(metadata);

  const documentLink = externalLink("Abrir livro no Drive ↗", book.documentUrl, "primary");
  if (documentLink) content.append(documentLink);
  details.showModal();
  byId("close").focus();
}

function bookCover(book) {
  const cover = el("div", "", "cover");
  const placeholder = el("span", "U.");
  cover.append(placeholder);
  cover.setAttribute("aria-hidden", "true");
  const coverUrl = safeLink(book.coverUrl);
  if (coverUrl) {
    const image = el("img");
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("load", () => { placeholder.hidden = true; }, { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = coverUrl;
    cover.append(image);
  }
  return cover;
}

function bookCard(book) {
  const card = el("article", "", "card");
  const body = el("div", "", "card-body");
  body.append(el("p", [book.category, book.year].filter(Boolean).join(" · "), "tag"), el("h3", book.title), el("p", book.authors, "muted"));
  const button = el("button", "Ver livro →");
  button.type = "button";
  button.setAttribute("aria-label", `Ver livro ${book.title}`);
  button.addEventListener("click", () => showDetails(book));
  card.append(bookCover(book), body, button);
  return card;
}

function render() {
  const term = normalize(search.value.trim());
  const filtered = books.filter((book) => {
    const text = [book.title, book.authors, ...(book.records || []).map((record) => record.code)].join(" ");
    return (!category.value || book.category === category.value) && normalize(text).includes(term);
  });
  list.replaceChildren(...filtered.map(bookCard));
  byId("count").hidden = false;
  byId("count").textContent = filtered.length === 1 ? "1 obra" : `${filtered.length} obras`;
  showState(filtered.length ? "" : "Nenhuma obra encontrada", "Tente buscar outro título, autor ou código.");
}

function loadCatalog(url) {
  return new Promise((resolve, reject) => {
    const script = el("script");
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      delete window.ujnCatalog;
    };
    const fail = () => {
      cleanup();
      reject(new Error("Catálogo indisponível"));
    };
    const timer = setTimeout(fail, 12000);
    window.ujnCatalog = (result) => {
      cleanup();
      if (result?.ok && Array.isArray(result.books)) resolve(result.books);
      else reject(new Error("Catálogo indisponível"));
    };
    script.addEventListener("error", fail, { once: true });
    url.searchParams.set("catalogo", "1");
    script.src = url.href;
    document.head.append(script);
  });
}

byId("close").addEventListener("click", () => details.close());
search.addEventListener("input", render);
category.addEventListener("change", render);

try {
  const url = await endpoint();
  if (!url) {
    showState("Catálogo em preparação", "As obras publicadas pela Editora UJN serão apresentadas aqui.");
  } else {
    books = await loadCatalog(url);
    if (books.length) {
      const categories = [...new Set(books.map((book) => book.category).filter(Boolean))];
      categories.sort((a, b) => a.localeCompare(b, "pt-BR"));
      for (const item of categories) category.add(new Option(item, item));
      byId("filters").hidden = false;
      render();
    } else {
      showState("Nenhuma obra publicada", "As próximas publicações serão apresentadas aqui.");
    }
  }
} catch {
  showState("Catálogo temporariamente indisponível", "Atualize a página para tentar novamente.");
}
