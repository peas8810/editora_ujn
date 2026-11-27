const SUBMISSION_TAB = 'Submissões de livros';
const EDITORIAL_EMAIL = 'contato@ujn.ojsbr.com';
const SUBMISSION_FIELDS = ['id', 'received', 'name', 'email', 'title', 'fileId', 'notification', 'status', 'amount', 'qrId', 'accepted'];
const SUBMISSION_HEADERS = ['Protocolo', 'Recebido em', 'Nome', 'E-mail', 'Título', 'Arquivo no Drive', 'Aviso à editora', 'Situação', 'Custeio', 'QR Pix no Drive', 'Aceito em'];
const PIX_TYPES = ['image/png', 'image/jpeg'];
const SUBMISSION_PENDING = 'Em análise';
const SUBMISSION_SENDING = 'Envio a conferir';
const SUBMISSION_ACCEPTED = 'Aceito';

function setupBookSubmissions() {
  authorize_();
  return withSubmissionLock_(() => {
    const props = PropertiesService.getScriptProperties();
    const spreadsheet = submissionSpreadsheet_();
    let sheet = spreadsheet.getSheetByName(SUBMISSION_TAB);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SUBMISSION_TAB);
      sheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length).setValues([SUBMISSION_HEADERS]);
      sheet.setFrozenRows(1);
      SpreadsheetApp.flush();
    }
    submissionRecords_();
    if (!props.getProperty('SUBMISSION_FOLDER_ID')) {
      const folder = DriveApp.createFolder('Editora UJN - Submissões privadas de livros');
      props.setProperty('SUBMISSION_FOLDER_ID', folder.getId());
    }
    submissionFolder_();
    if (!props.getProperty('SUBMISSION_TOKEN_SECRET')) {
      props.setProperty('SUBMISSION_TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
    }
    return true;
  });
}

function publicSubmissionPage_() {
  const secret = PropertiesService.getScriptProperties().getProperty('SUBMISSION_TOKEN_SECRET');
  const page = HtmlService.createTemplateFromFile('Submit');
  const token = Utilities.getUuid() + '.' + Date.now();
  page.token = secret ? token + '.' + signSubmissionToken_(token, secret) : '';
  return page.evaluate()
    .setTitle('Quero publicar meu livro | Editora UJN')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function submitBookProposal(form) {
  const id = submissionTokenId_(form?.token);
  if (field_(form.website, 120, 'site')) throw new Error('Não foi possível registrar a proposta.');
  const name = field_(form.authorName, 150, 'o nome', true);
  const email = field_(form.email, 254, 'o e-mail', true);
  const title = field_(form.title, 250, 'o título', true);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  const document = upload_(form.documentFile, 'o manuscrito em PDF (até 20 MB)', 20 * MIB, ['application/pdf']);
  if (!document) throw new Error('Anexe o manuscrito em PDF.');

  return withSubmissionLock_(() => {
    const { spreadsheet, sheet, items } = submissionRecords_();
    const existing = items.find(item => item.id === id);
    if (existing) return { id };
    const since = new Date(Date.now() - 3600000).toISOString();
    const recentByAuthor = items.filter(item => item.received >= since && item.email.toLowerCase() === email.toLowerCase());
    if (recentByAuthor.length >= 5) throw new Error('Você atingiu o limite de cinco propostas por hora. Tente novamente mais tarde.');
    const folder = submissionFolder_();
    const previous = folder.getFilesByName(id + '.pdf');
    const file = previous.hasNext() ? previous.next() : folder.createFile(document.blob.setName(id + '.pdf'));
    const item = { id, received: new Date().toISOString(), name, email, title, fileId: file.getId(), notification: 'Pendente', status: SUBMISSION_PENDING };
    try {
      const result = Sheets.Spreadsheets.Values.append(
        { values: [SUBMISSION_FIELDS.map(key => item[key] || '')] },
        spreadsheet.getId(),
        "'" + SUBMISSION_TAB + "'!A:K",
        { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }
      );
      item.row = Number(result.updates.updatedRange.match(/!A(\d+):/)[1]);
    } catch (error) {
      console.error('Registro da proposta ' + id, error);
      throw new Error('Não foi possível confirmar o registro. Tente novamente nesta página.');
    }
    try { sendSubmissionNotice_(sheet, item); } catch (error) { console.error('Aviso da proposta ' + id, error); }
    return { id };
  });
}

function listBookProposals() {
  authorize_();
  const configured = Boolean(PropertiesService.getScriptProperties().getProperty('SUBMISSION_TOKEN_SECRET'));
  if (!configured) return { configured: false, items: [] };
  return { configured, items: submissionRecords_().items.reverse() };
}

function retryBookProposalNotice(id) {
  authorize_();
  return withSubmissionLock_(() => {
    const { sheet, items } = submissionRecords_();
    const item = items.find(record => record.id === id);
    if (!item) throw new Error('Proposta não encontrada.');
    sendSubmissionNotice_(sheet, item);
    return true;
  });
}

function acceptBookProposal(form) {
  authorize_();
  const id = field_(form?.proposalId, 36, 'o protocolo', true);
  const amount = field_(form.amount, 18, 'o valor do custeio', true);
  if (!/^[0-9]{1,8}(?:[,.][0-9]{1,2})?$/.test(amount) || Number(amount.replace(',', '.')) <= 0) {
    throw new Error('Informe o valor do custeio em reais, por exemplo 750,00.');
  }
  const total = Number(amount.replace(',', '.')).toFixed(2).replace('.', ',');
  const qr = upload_(form.qrFile, 'o QR Code Pix (PNG ou JPG, até 2 MB)', 2 * MIB, PIX_TYPES);
  if (!qr || form.confirmPix !== 'yes') throw new Error('Anexe e confirme o QR Code Pix do valor informado.');

  return withSubmissionLock_(() => {
    const { sheet, items } = submissionRecords_();
    const item = items.find(record => record.id === id);
    if (!item) throw new Error('Proposta não encontrada.');
    if (item.status === SUBMISSION_ACCEPTED) return true;
    if (item.status !== SUBMISSION_PENDING) throw new Error('Confira o envio anterior antes de aceitar novamente.');
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('A cota diária de e-mails foi atingida. Tente novamente mais tarde.');

    const qrName = id + '-pix.' + (qr.type === 'image/png' ? 'png' : 'jpg');
    const attachment = qr.blob.setName(qrName);
    const file = submissionFolder_().createFile(attachment);
    const state = sheet.getRange(item.row, 8, 1, 4);
    state.setValues([[SUBMISSION_SENDING, 'R$ ' + total, file.getId(), '']]);
    SpreadsheetApp.flush();
    try {
      MailApp.sendEmail({
        to: item.email,
        replyTo: EDITORIAL_EMAIL,
        name: 'Editora UJN',
        subject: 'Aceite editorial do seu livro | Editora UJN',
        body: 'Olá, ' + item.name + '!\n\nRecebemos e aceitamos sua proposta de publicação.\n\n' +
          'Título: ' + item.title + '\nProtocolo: ' + id + '\nCusteio: R$ ' + total +
          '\n\nUse o QR Code Pix em anexo para pagar o custeio. Em caso de dúvida, responda a este e-mail.\n\nEditora UJN',
        attachments: [attachment]
      });
    } catch (error) {
      console.error('Aceite da proposta ' + id, error);
      throw new Error('O envio do aceite precisa ser conferido. Consulte a atividade de e-mail antes de tentar novamente.');
    }
    state.setValues([[SUBMISSION_ACCEPTED, 'R$ ' + total, file.getId(), new Date().toISOString()]]);
    SpreadsheetApp.flush();
    return true;
  });
}

function sendSubmissionNotice_(sheet, item) {
  if (item.notification === 'Enviado') return;
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('A cota diária de e-mails foi atingida.');
  MailApp.sendEmail({
    to: EDITORIAL_EMAIL,
    name: 'Editora UJN',
    replyTo: item.email,
    subject: 'Novo livro submetido | Editora UJN',
    body: 'Uma proposta de livro foi registrada.\n\nProtocolo: ' + item.id +
      '\nAutor(a): ' + item.name + '\nE-mail: ' + item.email + '\nTítulo: ' + item.title +
      '\n\nAbra o painel editorial para consultar o manuscrito e avaliar a proposta.'
  });
  sheet.getRange(item.row, 7).setValue('Enviado');
  SpreadsheetApp.flush();
}

function submissionSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('EDITORIAL_SPREADSHEET_ID');
  if (!id) throw new Error('Configure a planilha editorial no Apps Script.');
  return SpreadsheetApp.openById(id);
}

function submissionRecords_() {
  const spreadsheet = submissionSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(SUBMISSION_TAB);
  const items = rows_(sheet, 1, SUBMISSION_HEADERS, SUBMISSION_FIELDS);
  return { spreadsheet, sheet, items };
}

function submissionFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('SUBMISSION_FOLDER_ID');
  if (!id) throw new Error('As submissões ainda não foram ativadas.');
  const folder = DriveApp.getFolderById(id);
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('A pasta de submissões precisa estar privada.');
  return folder;
}

function withSubmissionLock_(operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('O sistema está ocupado. Tente novamente em instantes.');
  try { return operation(); } finally { lock.releaseLock(); }
}

function signSubmissionToken_(data, secret) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(data, secret));
}

function submissionTokenId_(token) {
  const secret = PropertiesService.getScriptProperties().getProperty('SUBMISSION_TOKEN_SECRET');
  if (!secret) throw new Error('As submissões ainda não foram ativadas.');
  const match = typeof token === 'string' && token.match(/^([0-9a-f-]{36})\.(\d{13})\.([A-Za-z0-9_-]{43}=)$/);
  if (!match || Date.now() - Number(match[2]) >= 7200000 ||
      signSubmissionToken_(match[1] + '.' + match[2], secret) !== match[3]) {
    throw new Error('A sessão do formulário venceu. Recarregue a página e tente novamente.');
  }
  return match[1];
}
