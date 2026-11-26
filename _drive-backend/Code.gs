const BOOK_FOLDER_ID = '1Oz-bisW47wXBGkmEkR5zeJ1AfPTk0BzY';
const SESSION_SECONDS = 7200;
const MIB = 1024 * 1024;

function doGet(event) {
  if (event && event.parameter.catalogo === '1') {
    let result;
    try {
      result = { ok: true, books: entries_().map(entry => entry.book).filter(book => book.published).reverse().map(publicBook_) };
    } catch (error) {
      console.error(error);
      result = { ok: false };
    }

    // A fixed callback serves only public metadata to the static catalog.
    return ContentService.createTextOutput('ujnCatalog(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return HtmlService.createHtmlOutputFromFile('Admin')
    .setTitle('Painel editorial | Editora UJN')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function login(password) {
  const expected = passwordHash_();
  const cache = CacheService.getScriptCache();
  const key = 'failed:' + Session.getTemporaryActiveUserKey();
  return locked_(() => {
    const failures = Number(cache.get(key) || 0);
    if (failures >= 8) throw new Error('Muitas tentativas. Aguarde 15 minutos.');
    if (typeof password !== 'string' || password.length > 200 || !equal_(digest_(password), expected)) {
      cache.put(key, String(failures + 1), 900);
      throw new Error('Senha inválida.');
    }
    cache.remove(key);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put('session:' + digest_(token), expected, SESSION_SECONDS);
    return { token, books: entries_().map(entry => entry.book).reverse() };
  });
}

function logout(token) {
  if (typeof token === 'string' && token.length === 72) CacheService.getScriptCache().remove('session:' + digest_(token));
}

function listBooks(token) {
  authorize_(token);
  return entries_().map(entry => entry.book).reverse();
}

function saveBook(form) {
  authorize_(form.token);
  if (form.publicationConsent !== 'yes') throw new Error('Confirme a autorização de publicação.');
  const book = validatedBook_(form);
  const input = {
    document: mediaInput_(form.documentFile, form.documentDriveUrl, 'PDF', 20 * MIB, ['application/pdf']),
    cover: mediaInput_(form.coverFile, form.coverDriveUrl, 'capa', 4 * MIB, ['image/jpeg', 'image/png', 'image/webp'])
  };

  return locked_(() => {
    authorize_(form.token);
    const sheet = sheet_(true);
    const previous = entries_(sheet).find(entry => entry.book.id === book.id);
    if ((previous ? String(previous.book.revision) : '') !== form.revision) {
      throw new Error('A obra mudou desde que você abriu o formulário. Atualize a lista e abra novamente.');
    }
    if ((!input.document && !previous?.book.documentUrl) || (!input.cover && !previous?.book.coverUrl)) {
      throw new Error('Envie o PDF e a capa ou informe os links de arquivos existentes no Drive.');
    }

    const created = [];
    let saved = false;
    try {
      const folder = DriveApp.getFolderById(BOOK_FOLDER_ID);
      const pdf = input.document ? saveMedia_(folder, input.document, book.title, 'livro', created) : null;
      const cover = input.cover ? saveMedia_(folder, input.cover, book.title, 'capa', created) : null;
      book.documentUrl = pdf ? pdf.getUrl() : previous.book.documentUrl;
      book.coverUrl = cover ? coverUrl_(cover) : previous.book.coverUrl;
      book.published = previous ? previous.book.published : true;
      book.revision = (previous?.book.revision || 0) + 1;
      book.updatedAt = new Date().toISOString();
      write_(sheet, previous, book);
      saved = true;
      return book;
    } finally {
      if (!saved) created.forEach(file => {
        try { file.setTrashed(true); } catch (error) { console.error(error); }
      });
    }
  });
}

function setPublished(token, id, revision, published) {
  authorize_(token);
  return locked_(() => {
    authorize_(token);
    const sheet = sheet_(false);
    const entry = entries_(sheet).find(item => item.book.id === id);
    if (!entry || entry.book.revision !== revision) throw new Error('A obra foi alterada. Atualize a lista.');
    const book = { ...entry.book, published: published === true, revision: revision + 1, updatedAt: new Date().toISOString() };
    write_(sheet, entry, book);
    return book;
  });
}

function passwordHash_() {
  const hash = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD_SHA256');
  if (!/^[a-f0-9]{64}$/.test(hash || '')) throw new Error('O acesso administrativo ainda precisa ser configurado.');
  return hash;
}

function authorize_(token) {
  const validToken = typeof token === 'string' && token.length === 72;
  const value = validToken && CacheService.getScriptCache().get('session:' + digest_(token));
  if (!value || !equal_(value, passwordHash_())) throw new Error('Sessão expirada. Entre novamente.');
}

function digest_(input) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}

function equal_(first, second) {
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= first.charCodeAt(i) ^ second.charCodeAt(i);
  return difference === 0;
}

function locked_(operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('O painel está ocupado. Tente novamente em instantes.');
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function sheet_(create) {
  const properties = PropertiesService.getScriptProperties();
  const id = properties.getProperty('CATALOG_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id).getSheets()[0];
  if (!create) return null;

  const spreadsheet = SpreadsheetApp.create('Editora UJN — base do catálogo');
  const sheet = spreadsheet.getSheets()[0];
  sheet.getRange(1, 1).setValue('Obra (JSON)');
  SpreadsheetApp.flush();
  properties.setProperty('CATALOG_SPREADSHEET_ID', spreadsheet.getId());
  return sheet;
}

function entries_(sheet = sheet_(false)) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
    .map(([value], index) => value ? { row: index + 2, book: JSON.parse(value) } : null)
    .filter(Boolean);
}

function write_(sheet, entry, book) {
  sheet.getRange(entry ? entry.row : sheet.getLastRow() + 1, 1).setValue(JSON.stringify(book));
  SpreadsheetApp.flush();
}

function publicBook_(book) {
  const { id, title, authors, category, year, pages, description, records, documentUrl, coverUrl } = book;
  return { id, title, authors, category, year, pages, description, records, documentUrl, coverUrl };
}

function field_(input, limit, label, required = false) {
  const value = typeof input === 'string' ? input.trim() : '';
  if (required && !value) throw new Error('Preencha ' + label + '.');
  if (value.length > limit) throw new Error('O campo ' + label + ' excedeu o limite de caracteres.');
  return value;
}

function integer_(input, min, max, label) {
  const value = field_(input, 10, label);
  if (!value) return null;
  const number = Number(value);
  if (!/^\d+$/.test(value) || number < min || number > max) throw new Error('Informe ' + label + ' válido.');
  return number;
}

function safeRecordUrl_(input) {
  const url = field_(input, 2048, 'link do registro');
  if (url && !/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:[/?#][^\s\\]*)?$/i.test(url)) {
    throw new Error('Use um endereço HTTPS válido para o registro.');
  }
  return url;
}

function validatedBook_(form) {
  if (!/^[a-f0-9-]{36}$/i.test(form.id)) throw new Error('Identificador inválido.');

  let records;
  try { records = JSON.parse(form.records || '[]'); } catch { throw new Error('Registros inválidos.'); }
  if (!Array.isArray(records) || records.length > 8) throw new Error('Informe até oito registros por obra.');

  return {
    id: form.id,
    title: field_(form.title, 180, 'o título', true),
    authors: field_(form.authors, 500, 'a autoria', true),
    category: field_(form.category, 80, 'a categoria', true),
    description: field_(form.description, 2200, 'sinopse'),
    year: integer_(form.year, 1000, 9999, 'um ano'),
    pages: integer_(form.pages, 1, 99999, 'um número de páginas'),
    records: records.filter(record => record && (record.code || record.url)).map(record => ({
      label: field_(record.label, 50, 'o tipo de registro', true),
      code: field_(record.code, 180, 'código do registro'),
      url: safeRecordUrl_(record.url)
    }))
  };
}

function mediaInput_(blob, link, label, maxSize, types) {
  if (blob && typeof blob.getBytes === 'function' && blob.getName()) {
    if (link?.trim()) throw new Error('Para ' + label + ', selecione um arquivo ou informe um link.');
    const type = String(blob.getContentType()).toLowerCase();
    const bytes = blob.getBytes();
    const prefix = (start, end) => bytes.slice(start, end).map(byte => String.fromCharCode(byte & 255)).join('');
    const hasSignature = {
      'application/pdf': prefix(0, 5) === '%PDF-',
      'image/jpeg': prefix(0, 3) === '\xFF\xD8\xFF',
      'image/png': prefix(0, 8) === '\x89PNG\r\n\x1A\n',
      'image/webp': prefix(0, 4) === 'RIFF' && prefix(8, 12) === 'WEBP'
    };
    if (!bytes.length || bytes.length > maxSize || !types.includes(type) || !hasSignature[type]) {
      throw new Error('Formato ou tamanho inválido para ' + label + '.');
    }
    return { blob, type };
  }

  const url = field_(link, 2048, 'link do Drive');
  if (!url) return null;
  const match = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/(?:view|preview)(?:\?([^\s#]*))?$/);
  if (!match) throw new Error('Cole o link de compartilhamento do arquivo no Google Drive.');
  const resourceKey = (match[2] || '').match(/(?:^|&)resourcekey=([a-zA-Z0-9_-]+)/i);
  return { id: match[1], resourceKey: resourceKey?.[1], types };
}

function inFolder_(file, folderId) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    const parent = parents.next();
    if (parent.getId() === folderId || inFolder_(parent, folderId)) return true;
  }
  return false;
}

function saveMedia_(folder, input, title, label, created) {
  if (input.id) {
    const file = input.resourceKey ? DriveApp.getFileByIdAndResourceKey(input.id, input.resourceKey) : DriveApp.getFileById(input.id);
    if (!inFolder_(file, folder.getId()) || !input.types.includes(file.getMimeType())) {
      throw new Error('O arquivo de ' + label + ' precisa estar na pasta editorial do Drive e ter o formato indicado.');
    }
    if (![DriveApp.Access.ANYONE, DriveApp.Access.ANYONE_WITH_LINK].includes(file.getSharingAccess())) {
      throw new Error('No Drive, permita a leitura de ' + label + ' para qualquer pessoa com o link.');
    }
    return file;
  }

  const extension = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[input.type];
  const name = title.replace(/[\\/\u0000-\u001f]/g, ' ').slice(0, 130) + ' — ' + label + '.' + extension;
  const file = folder.createFile(input.blob.setName(name));
  created.push(file);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file;
}

function coverUrl_(file) {
  const resourceKey = file.getResourceKey();
  return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(file.getId()) + '&sz=w800'
    + (resourceKey ? '&resourcekey=' + encodeURIComponent(resourceKey) : '');
}
