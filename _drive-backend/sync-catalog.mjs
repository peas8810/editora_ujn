import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizedIsbn } from "../editora/isbn.js";

const BOOK_HEADERS = ["ISBN", "Título", "Autoria ou organização", "Edição", "Formato", "Categoria", "Ano", "Páginas", "Sinopse", "Link do PDF", "Link da capa", "Link oficial do ISBN", "Página do livro no site", "Situação editorial"];
const RECORD_HEADERS = ["ISBN do livro", "Tipo de registro", "Código", "Link oficial do registro", "Link de documento público"];

function table(rows, expected) {
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) || expected.some((name, index) => rows[0][index] !== name)) {
    throw new Error("Os cabeçalhos da planilha não correspondem ao cadastro editorial.");
  }
  return rows.slice(1).map((row) => expected.map((_, index) => String(row[index] ?? "").trim()));
}

function https(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function driveFile(value) {
  const valid = https(value);
  if (!valid) return null;
  const url = new URL(valid);
  if (url.origin !== "https://drive.google.com") return null;

  const fileId = url.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]
    || (["/open", "/uc"].includes(url.pathname) ? url.searchParams.get("id") : "");
  if (!fileId || !/^[\w-]+$/.test(fileId)) return null;

  const document = new URL(`https://drive.google.com/file/d/${fileId}/view`);
  const thumbnail = new URL("https://drive.google.com/thumbnail");
  thumbnail.searchParams.set("id", fileId);
  thumbnail.searchParams.set("sz", "w800");
  const resourceKey = url.searchParams.get("resourcekey");
  if (resourceKey && /^[\w-]+$/.test(resourceKey)) {
    document.searchParams.set("resourcekey", resourceKey);
    thumbnail.searchParams.set("resourcekey", resourceKey);
  }
  return { document: document.href, thumbnail: thumbnail.href };
}

export function compileCatalog(bookRows, recordRows) {
  const books = new Map();
  const duplicates = new Set();
  const issues = [];
  const source = table(bookRows, BOOK_HEADERS);
  const extra = table(recordRows, RECORD_HEADERS);

  source.forEach(([code, title, authors, edition, format, category, year, pages, description, pdf, cover, isbnRegistry, , status], index) => {
    if (!/^publicad[oa]$/i.test(status)) return;
    const row = index + 6;
    const isbn = normalizedIsbn(code);
    const document = driveFile(pdf);
    const thumbnail = driveFile(cover);
    const registry = https(isbnRegistry);

    if (!isbn || !title || !document || (cover && !thumbnail) || (isbnRegistry && !registry)) {
      issues.push(`Cadastro de livros, linha ${row}: confira o ISBN, o título e os links do PDF, da capa e do registro.`);
      return;
    }
    if (books.has(isbn) || duplicates.has(isbn)) {
      books.delete(isbn);
      duplicates.add(isbn);
      issues.push(`Cadastro de livros, linha ${row}: ISBN publicado em duplicidade (${isbn}).`);
      return;
    }
    books.set(isbn, {
      isbn, title, authors, edition, format, category, year, pages, description,
      documentUrl: document.document,
      coverUrl: thumbnail?.thumbnail || "",
      isbnUrl: registry,
      records: []
    });
  });

  extra.forEach(([bookCode, label, code, url, document], index) => {
    const book = books.get(normalizedIsbn(bookCode));
    if (!book || (!label && !code && !url && !document)) return;
    const registry = https(url);
    const file = https(document);
    if (!label || (!code && !registry && !file) || (url && !registry) || (document && !file)) {
      issues.push(`Registros complementares, linha ${index + 5}: confira o tipo do registro e os links HTTPS.`);
      return;
    }
    book.records.push({ label, code, url: registry, documentUrl: file });
  });

  return { books: [...books.values()].reverse(), issues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { books, records } = JSON.parse(readFileSync(0, "utf8"));
  const result = compileCatalog(books, records);
  console.log(JSON.stringify({ books: result.books }, null, 2));
  for (const issue of result.issues) console.error(issue);
}
