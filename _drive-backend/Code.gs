const BOOK_FOLDER_ID = '1Oz-bisW47wXBGkmEkR5zeJ1AfPTk0BzY';
const BOOK_TAB = 'Cadastro de livros';
const RECORD_TAB = 'Registros complementares';
const BOOK_FIELDS = ['isbn', 'title', 'authors', 'edition', 'format', 'category', 'year', 'pages', 'description', 'documentUrl', 'coverUrl', 'isbnUrl', 'pageUrl', 'status'];
const BOOK_HEADERS = ['ISBN', 'Título', 'Autoria ou organização', 'Edição', 'Formato', 'Categoria', 'Ano', 'Páginas', 'Sinopse', 'Link do PDF', 'Link da capa', 'Link oficial do ISBN', 'Página do livro no site', 'Situação editorial'];
const RECORD_FIELDS = ['isbn', 'label', 'code', 'url', 'documentUrl'];
const RECORD_HEADERS = ['ISBN do livro', 'Tipo de registro', 'Código', 'Link oficial do registro', 'Link de documento público'];
const MIB = 1024 * 1024;

function doGet(event) {
  if (event?.parameter?.view === 'submit') return publicSubmissionPage_();
  authorize_();
  return HtmlService.createHtmlOutputFromFile('Admin')
    .setTitle('Painel editorial | Editora UJN')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function listBooks() {
  authorize_();
  return catalog_().books.reverse();
}

function saveBook(form) {
  authorize_();
  const book = validatedBook_(form);
  const pdf = upload_(form.documentFile, 'PDF', 20 * MIB, ['application/pdf']);
  const cover = upload_(form.coverFile, 'capa', 4 * MIB, ['image/jpeg', 'image/png', 'image/webp']);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('O painel está ocupado. Tente novamente em instantes.');

  try {
    const catalog = catalog_();
    const matches = catalog.books.filter(entry => entry.isbn === book.isbn);
    const previous = matches[0];
    if (matches.length > 1 || (previous?.revision || '') !== form.revision) {
      throw new Error('ISBN já cadastrado ou ficha modificada. Atualize a lista antes de editar.');
    }
    if (!previous && catalog.linkedRecords.has(book.isbn)) {
      throw new Error('Já existem registros complementares para este ISBN sem uma ficha de livro. Vincule-os na planilha antes de editar a obra pelo painel.');
    }
    const published = book.status === 'Publicado';
    if (!pdf && !previous?.documentUrl && published) throw new Error('Envie o PDF para publicar a obra.');

    const staged = [];
    const moves = [];
    let writeStarted = false;
    try {
      const folder = DriveApp.getFolderById(BOOK_FOLDER_ID);
      if (published && ![DriveApp.Access.ANYONE, DriveApp.Access.ANYONE_WITH_LINK].includes(folder.getSharingAccess())) {
        throw new Error('A pasta de livros precisa permitir leitura pública por link.');
      }
      const draft = draftFolder_();
      const destination = published ? folder : draft;
      book.documentUrl = saveMedia_(pdf, previous?.documentUrl, draft, folder, destination, book.isbn, 'livro', staged, moves);
      book.coverUrl = saveMedia_(cover, previous?.coverUrl, draft, folder, destination, book.isbn, 'capa', staged, moves);
      if (published && (!driveId_(book.documentUrl) || (book.coverUrl && !driveId_(book.coverUrl)))) {
        throw new Error('Envie arquivos válidos do Drive para publicar a obra.');
      }

      const changes = [];
      const bookRow = previous?.row ?? catalog.nextBookRow;
      if (bookRow > catalog.bookSheet.getMaxRows()) changes.push(extend_(catalog.bookSheet, 1));
      changes.push(cells_(catalog.bookSheet, bookRow, BOOK_FIELDS.map(key => book[key])));

      const existing = previous?.records || [];
      const added = Math.max(0, book.records.length - existing.length);
      const needed = added ? catalog.nextRecordRow + added - 1 - catalog.recordSheet.getMaxRows() : 0;
      if (needed > 0) changes.push(extend_(catalog.recordSheet, needed));
      let nextRecordRow = catalog.nextRecordRow;
      for (let i = 0; i < Math.max(existing.length, book.records.length); i++) {
        const record = book.records[i];
        const row = existing[i]?.row ?? nextRecordRow++;
        changes.push(cells_(catalog.recordSheet, row, RECORD_FIELDS.map(key => record?.[key] ?? '')));
      }

      writeStarted = true;
      Sheets.Spreadsheets.batchUpdate({ requests: changes }, catalog.id);
    } catch (error) {
      // A timeout may arrive after Sheets has committed. Keep files if the write cannot be verified.
      let committed = false;
      let canRollback = !writeStarted;
      if (writeStarted) {
        try {
          const current = catalog_().books.find(entry => entry.isbn === book.isbn);
          committed = current?.revision === revision_(book);
          canRollback = !committed && (current?.revision || '') === (previous?.revision || '');
        } catch (verificationError) {
          console.error(verificationError);
        }
      }
      if (canRollback) {
        moves.reverse().forEach(({ file, parent }) => cleanup_(() => file.moveTo(parent)));
        staged.forEach(file => cleanup_(() => file.setTrashed(true)));
      }
      if (!committed) throw error;
    }
    return listBooks();
  } finally {
    lock.releaseLock();
  }
}

function authorize_() {
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const owner = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!active || active !== owner) throw new Error('Use a conta Google responsável pelo painel editorial.');
}

function catalog_() {
  const id = PropertiesService.getScriptProperties().getProperty('EDITORIAL_SPREADSHEET_ID');
  if (!id) throw new Error('A planilha editorial precisa ser configurada.');
  const spreadsheet = SpreadsheetApp.openById(id);
  const bookSheet = spreadsheet.getSheetByName(BOOK_TAB);
  const recordSheet = spreadsheet.getSheetByName(RECORD_TAB);
  const bookRows = rows_(bookSheet, 5, BOOK_HEADERS, BOOK_FIELDS);
  const recordRows = rows_(recordSheet, 4, RECORD_HEADERS, RECORD_FIELDS);
  const byIsbn = new Map();
  for (const record of recordRows) {
    const key = normalizeIsbn_(record.isbn);
    if (!byIsbn.has(key)) byIsbn.set(key, []);
    byIsbn.get(key).push(record);
  }
  const books = bookRows.filter(row => row.isbn || row.title).map(row => {
    const isbn = normalizeIsbn_(row.isbn);
    const entry = { ...row, isbn, records: isbn ? byIsbn.get(isbn) || [] : [] };
    return { ...entry, revision: revision_(entry) };
  });
  return { id, bookSheet, recordSheet, books, linkedRecords: byIsbn, nextBookRow: bookSheet.getLastRow() + 1, nextRecordRow: recordSheet.getLastRow() + 1 };
}

function rows_(sheet, headerRow, headers, keys) {
  if (!sheet) throw new Error('Uma das abas editoriais está ausente.');
  const grid = sheet.getRange(headerRow, 1, Math.max(1, sheet.getLastRow() - headerRow + 1), keys.length).getDisplayValues();
  if (headers.some((header, i) => grid[0][i] !== header)) throw new Error('Os cabeçalhos editoriais foram alterados.');
  return grid.slice(1).map((values, i) => ({
    row: headerRow + i + 1,
    ...Object.fromEntries(keys.map((key, column) => [key, values[column]]))
  })).filter(item => keys.some(key => item[key]));
}

function revision_(book) {
  const serialized = JSON.stringify([
    BOOK_FIELDS.map(key => book[key]),
    book.records.map(record => RECORD_FIELDS.map(key => record[key]))
  ]);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, serialized, Utilities.Charset.UTF_8));
}

function cells_(sheet, row, values) {
  return { updateCells: {
    start: { sheetId: sheet.getSheetId(), rowIndex: row - 1, columnIndex: 0 },
    rows: [{ values: values.map(value => value === '' ? {} : { userEnteredValue: { stringValue: value } }) }],
    fields: 'userEnteredValue'
  } };
}

function extend_(sheet, length) {
  return { appendDimension: { sheetId: sheet.getSheetId(), dimension: 'ROWS', length } };
}

function validatedBook_(form) {
  const isbn = normalizeIsbn_(form.isbn);
  if (!isbn) throw new Error('Informe um ISBN válido.');
  if (!['Rascunho', 'Publicado'].includes(form.status)) throw new Error('Selecione a situação editorial.');
  if (form.status === 'Publicado' && form.publicationConsent !== 'yes') throw new Error('Confirme a autorização de publicação.');
  let records;
  try { records = JSON.parse(form.records || '[]'); } catch { throw new Error('Registros inválidos.'); }
  if (!Array.isArray(records)) throw new Error('Registros inválidos.');

  return {
    isbn,
    title: field_(form.title, 250, 'o título', true),
    authors: field_(form.authors, 1000, 'a autoria ou organização'),
    edition: field_(form.edition, 80, 'a edição'),
    format: field_(form.format, 80, 'o formato'),
    category: field_(form.category, 120, 'a categoria'),
    year: integer_(form.year, 1000, 9999, 'ano'),
    pages: integer_(form.pages, 1, 99999, 'número de páginas'),
    description: field_(form.description, 10000, 'a sinopse'),
    isbnUrl: https_(form.isbnUrl),
    pageUrl: 'https://publisherujn.com/editora/livro/?isbn=' + isbn,
    status: form.status,
    records: records.filter(record => record && [record.label, record.code, record.url, record.documentUrl].some(Boolean)).map(record => {
      const label = field_(record.label, 100, 'o tipo de registro', true);
      const code = field_(record.code, 250, 'o código');
      const url = https_(record.url);
      const documentUrl = https_(record.documentUrl);
      if (!code && !url && !documentUrl) throw new Error('Informe um código ou link em cada registro complementar.');
      return { isbn, label, code, url, documentUrl };
    })
  };
}

function field_(input, limit, label, required = false) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (required && !value) throw new Error('Preencha ' + label + '.');
  if (value.length > limit) throw new Error('Confira o tamanho do campo ' + label + '.');
  return value;
}

function integer_(input, min, max, label) {
  const value = field_(input, 10, label);
  if (value && (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max)) throw new Error('Confira o campo ' + label + '.');
  return value;
}

function https_(input) {
  const value = field_(input, 2048, 'link');
  if (value && !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s\\]*)?$/i.test(value)) throw new Error('Informe links HTTPS válidos.');
  return value;
}

function driveId_(url) {
  return (url || '').match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]
    || (url || '').match(/^https:\/\/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)(?:[&#]|$)/)?.[1]
    || '';
}

function draftFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const id = properties.getProperty('DRAFT_FOLDER_ID');
  const folder = id ? DriveApp.getFolderById(id) : DriveApp.createFolder('Editora UJN - Rascunhos privados');
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('A pasta de rascunhos precisa estar privada.');
  if (!id) properties.setProperty('DRAFT_FOLDER_ID', folder.getId());
  return folder;
}

function upload_(blob, label, maximum, types) {
  if (!blob || typeof blob.getBytes !== 'function' || !blob.getName()) return null;
  const type = String(blob.getContentType()).toLowerCase();
  const bytes = blob.getBytes();
  const chars = bytes.slice(0, 12).map(byte => String.fromCharCode(byte & 255)).join('');
  const signature = {
    'application/pdf': chars.startsWith('%PDF-'),
    'image/jpeg': chars.startsWith('\xff\xd8\xff'),
    'image/png': chars.startsWith('\x89PNG\r\n\x1a\n'),
    'image/webp': chars.startsWith('RIFF') && chars.slice(8) === 'WEBP'
  };
  if (bytes.length > maximum || !types.includes(type) || !signature[type]) throw new Error('Formato ou tamanho inválido para ' + label + '.');
  return { blob, type };
}

function saveMedia_(input, existing, draft, publicFolder, destination, isbn, label, staged, moves) {
  const marker = 'Editora UJN | ' + isbn + ' | ' + label;
  let file;
  let parent = draft;
  if (input) {
    const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[input.type];
    file = draft.createFile(input.blob.setName(isbn + '-' + label + '.' + extension));
    staged.push(file);
    file.setDescription(marker);
  } else {
    const id = driveId_(existing);
    if (!id) return existing || '';
    const key = existing.match(/[?&]resourcekey=([\w-]+)/i)?.[1];
    file = key ? DriveApp.getFileByIdAndResourceKey(id, key) : DriveApp.getFileById(id);
    if (file.getDescription() !== marker) return existing;
    const parents = file.getParents();
    parent = parents.hasNext() ? parents.next() : null;
    if (!parent || ![draft.getId(), publicFolder.getId()].includes(parent.getId())) throw new Error('O arquivo foi movido no Drive. Envie um novo arquivo.');
  }
  if (parent.getId() !== destination.getId()) {
    file.moveTo(destination);
    moves.push({ file, parent });
  }
  const key = file.getResourceKey();
  return 'https://drive.google.com/file/d/' + file.getId() + '/view' + (key ? '?resourcekey=' + encodeURIComponent(key) : '');
}

function cleanup_(operation) {
  try { operation(); } catch (error) { console.error(error); }
}
function normalizeIsbn_(value) {
  const code = String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
  const digit13 = (body) => String((10 - [...body].reduce(
    (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0
  ) % 10) % 10);

  if (/^97[89]\d{10}$/.test(code) && digit13(code.slice(0, 12)) === code[12]) {
    return code;
  }

  if (/^\d{9}[\dX]$/.test(code)) {
    const check = [...code].reduce((sum, digit, index) =>
      sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0);
    if (check % 11 === 0) {
      const body = "978" + code.slice(0, 9);
      return body + digit13(body);
    }
  }

  return "";
}
