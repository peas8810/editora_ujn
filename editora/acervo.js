export async function loadBooks() {
  const response = await fetch(new URL("./obras.json", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error("Catálogo indisponível");
  const { books } = await response.json();
  if (!Array.isArray(books)) throw new Error("Catálogo inválido");
  return books;
}

export function el(tag, content, className) {
  const node = document.createElement(tag);
  if (content) node.textContent = content;
  if (className) node.className = className;
  return node;
}

export function externalLink(text, value, className) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const link = el("a", text, className);
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  } catch {
    return null;
  }
}

export function bookCover(book) {
  const cover = el("div", "", "cover");
  const placeholder = el("span", "U.");
  cover.append(placeholder);
  cover.setAttribute("aria-hidden", "true");
  const source = externalLink("", book.coverUrl)?.href;
  if (source) {
    const image = el("img");
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("load", () => { placeholder.hidden = true; }, { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = source;
    cover.append(image);
  }
  return cover;
}
