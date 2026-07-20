import { BRAZILIAN_STATES, PERSON_TYPES } from './constants.js';
import { onlyDigits } from './validators.js';

const FIELD_LABELS = {
  name: ['nome', 'name', 'cliente', 'noivos', 'casal', 'noivo 1', 'noiva 1', 'noivo(a) 1', 'noiva'],
  partnerName: [
    'noivo 2',
    'noiva 2',
    'noivo(a) 2',
    'segundo noivo',
    'segunda noiva',
    'conjuge',
    'cônjuge',
    'parceiro',
    'parceira',
    'noivo',
  ],
  cpf: ['cpf noiva', 'cpf 1', 'cpf noivo 1', 'cpf noiva 1', 'cpf'],
  partnerDocument: ['cpf noivo', 'cpf 2', 'cpf noivo 2', 'cpf noiva 2', 'cpf segundo', 'cpf do segundo'],
  cnpj: ['cnpj'],
  document: ['documento', 'doc'],
  whatsapp: ['whatsapp', 'zap', 'wpp', 'whats', 'wa', 'telefone', 'tel', 'celular', 'fone', 'cel'],
  email: ['email', 'e-mail', 'e mail', 'mail'],
  instagram: ['instagram', 'insta', 'ig'],
  address: ['endereco', 'endereço', 'rua', 'logradouro', 'address', 'av', 'avenida'],
  city: ['cidade', 'city', 'municipio', 'município'],
  state: ['estado', 'uf', 'state'],
  eventDate: ['data do evento', 'data evento', 'data do casamento', 'data casamento'],
  eventTime: ['horario do evento', 'horário do evento', 'horario', 'horário', 'hora do evento', 'hora'],
  eventLocation: ['local do evento', 'local evento', 'local da festa', 'local', 'cerimonia', 'cerimônia'],
  eventCity: ['cidade do evento', 'cidade evento'],
  eventState: ['estado do evento', 'uf do evento', 'estado evento'],
  notes: ['observacoes', 'observações', 'obs', 'notas', 'anotacoes', 'anotações', 'descricao', 'descrição', 'description', 'info', 'informacoes', 'informações'],
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CPF_REGEX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const CNPJ_REGEX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/;
const PHONE_REGEX = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/;
const INSTAGRAM_REGEX = /(?:@|instagram\.com\/)([A-Za-z0-9._]+)/i;
const CITY_STATE_REGEX = /^(.+?)[\s,/-]+([A-Za-z]{2})$/;

function normalizeText(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const PLACEHOLDER_VALUES = new Set([
  'nao informado',
  'nao informada',
  'nao informados',
  'nao informadas',
  'sem informacao',
  'sem informacoes',
  'n/a',
  'na',
  '-',
  '—',
]);

export function isPlaceholderValue(value = '') {
  const normalized = normalizeText(value).replace(/[.!?,;]+$/g, '').trim();
  return !normalized || PLACEHOLDER_VALUES.has(normalized);
}

export const QUICK_CLIENT_COUPLE_TEMPLATE = `Noiva:
CPF noiva:
Noivo:
CPF noivo:
WhatsApp:
E-mail:
Instagram:
Endereço:
Cidade:
Estado:
Data do evento:
Horário:
Local:
Cidade do evento:
Estado do evento:
Descrição:`;

export const QUICK_CLIENT_SINGLE_TEMPLATE = `Cliente:
CPF:
WhatsApp:
E-mail:
Instagram:
Endereço:
Cidade:
Estado:
Data do evento:
Horário:
Local:
Cidade do evento:
Estado do evento:
Descrição:`;

function normalizeEventDate(value = '') {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const brMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  return '';
}

function normalizeEventTime(value = '') {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const rangeMatch = trimmed.match(/(\d{1,2})\s*h(?:\s*(?:às|as|a)\s*(\d{1,2})\s*h)?/i);
  if (rangeMatch) {
    const hours = String(parseInt(rangeMatch[1], 10)).padStart(2, '0');
    return `${hours}:00`;
  }

  const timeMatch = trimmed.match(/^(\d{1,2})[:hH](\d{2})(?:\s*h)?$/);
  if (timeMatch) {
    const hours = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    return `${hours}:${timeMatch[2]}`;
  }

  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;

  return '';
}

function detectField(label) {
  const normalized = normalizeText(label);
  const entries = [];

  for (const [field, labels] of Object.entries(FIELD_LABELS)) {
    for (const item of labels) {
      entries.push({ field, item, len: item.length });
    }
  }

  entries.sort((a, b) => b.len - a.len);

  for (const { field, item } of entries) {
    if (normalized === item || normalized.startsWith(`${item} `)) {
      return field;
    }
  }

  return null;
}

function normalizeInstagram(value = '') {
  const trimmed = value.trim();
  const match = trimmed.match(INSTAGRAM_REGEX);
  if (match) return `@${match[1]}`;
  if (trimmed.startsWith('@')) return trimmed;
  if (/^[A-Za-z0-9._]+$/.test(trimmed)) return `@${trimmed}`;
  return trimmed;
}

function normalizeState(value = '') {
  const cleaned = value.trim().toUpperCase();
  if (BRAZILIAN_STATES.includes(cleaned)) return cleaned;

  const normalized = normalizeText(value);
  const byName = {
    acre: 'AC',
    alagoas: 'AL',
    amapa: 'AP',
    amazonas: 'AM',
    bahia: 'BA',
    ceara: 'CE',
    'distrito federal': 'DF',
    'espirito santo': 'ES',
    goias: 'GO',
    maranhao: 'MA',
    'mato grosso': 'MT',
    'mato grosso do sul': 'MS',
    'minas gerais': 'MG',
    para: 'PA',
    paraiba: 'PB',
    parana: 'PR',
    pernambuco: 'PE',
    piaui: 'PI',
    'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN',
    'rio grande do sul': 'RS',
    rondonia: 'RO',
    roraima: 'RR',
    'santa catarina': 'SC',
    'sao paulo': 'SP',
    sergipe: 'SE',
    tocantins: 'TO',
  };

  return byName[normalized] || '';
}

function assignField(result, field, value) {
  if (!value || isPlaceholderValue(value)) return;

  if (field === 'cpf') {
    if (!result.document) {
      result.document = value;
    } else if (!result.partnerDocument) {
      result.partnerDocument = value;
      result.isCouple = true;
    }
    result.personType = PERSON_TYPES.INDIVIDUAL;
    return;
  }

  if (field === 'partnerDocument') {
    result.partnerDocument = value;
    result.isCouple = true;
    result.personType = PERSON_TYPES.INDIVIDUAL;
    return;
  }

  if (field === 'partnerName') {
    result.partnerName = value;
    result.isCouple = true;
    return;
  }

  if (field === 'name') {
    result.name = value;
    if (/\s+e\s+/i.test(value) || result.partnerName) {
      result.isCouple = true;
    }
    return;
  }

  if (field === 'cnpj') {
    result.document = value;
    result.personType = PERSON_TYPES.COMPANY;
    return;
  }

  if (field === 'document') {
    const digits = onlyDigits(value);
    result.document = value;
    result.personType = digits.length > 11 ? PERSON_TYPES.COMPANY : PERSON_TYPES.INDIVIDUAL;
    return;
  }

  if (field === 'instagram') {
    result.instagram = normalizeInstagram(value);
    return;
  }

  if (field === 'state') {
    result.state = normalizeState(value);
    return;
  }

  if (field === 'eventDate') {
    result.eventDate = normalizeEventDate(value);
    return;
  }

  if (field === 'eventTime') {
    result.eventTime = normalizeEventTime(value);
    return;
  }

  if (field === 'eventLocation') {
    result.eventLocation = value;
    return;
  }

  if (field === 'eventCity') {
    result.eventCity = value;
    return;
  }

  if (field === 'eventState') {
    result.eventState = normalizeState(value);
    return;
  }

  if (field === 'notes') {
    result.notes = result.notes ? `${result.notes}\n${value}` : value;
    return;
  }

  result[field] = value;
}

function extractAllUniqueCpfs(text = '') {
  const cpfs = [];
  const seen = new Set();

  [...String(text).matchAll(new RegExp(CPF_REGEX.source, 'g'))].forEach((match) => {
    const cpf = match[0];
    if (isBarePhoneLine(cpf)) return;

    const digits = onlyDigits(cpf);
    if (digits.length !== 11 || seen.has(digits)) return;

    seen.add(digits);
    cpfs.push(cpf);
  });

  return cpfs;
}

function applyCoupleCpfsFromText(text, result) {
  if (result.personType === PERSON_TYPES.COMPANY) return;

  const cpfs = extractAllUniqueCpfs(text);
  if (cpfs.length === 0) return;

  if (!result.document) {
    [result.document] = cpfs;
    result.personType = PERSON_TYPES.INDIVIDUAL;
  }

  const partnerCandidate = cpfs.find((cpf) => onlyDigits(cpf) !== onlyDigits(result.document));
  if (partnerCandidate) {
    result.partnerDocument = partnerCandidate;
    result.isCouple = true;
    result.personType = PERSON_TYPES.INDIVIDUAL;
  }
}

function applyCoupleNameSplit(result) {
  if (!result.name || result.partnerName) return;

  const split = result.name.split(/\s+e\s+/i);
  if (split.length === 2 && split[0]?.trim() && split[1]?.trim()) {
    result.name = split[0].trim();
    result.partnerName = split[1].trim();
    result.isCouple = true;
  }
}

function isBarePhoneLine(line) {
  const digits = onlyDigits(line);
  if (digits.length < 10 || digits.length > 11) return false;
  if (/[./]/.test(line)) return false;
  if (digits.length === 11 && digits[2] === '9') return true;
  return digits.length === 10 || digits.length === 11;
}

function extractFromLine(line, result, usedLines) {
  if (!result.email) {
    const email = line.match(EMAIL_REGEX)?.[0];
    if (email) {
      result.email = email;
      usedLines.add(line);
      return true;
    }
  }

  if (!result.instagram) {
    const instagram = line.match(INSTAGRAM_REGEX);
    if (instagram) {
      result.instagram = normalizeInstagram(instagram[0]);
      usedLines.add(line);
      return true;
    }
  }

  if (!result.whatsapp && (PHONE_REGEX.test(line) || isBarePhoneLine(line))) {
    const phone = line.match(PHONE_REGEX)?.[0] || line;
    result.whatsapp = phone;
    usedLines.add(line);
    return true;
  }

  if (!result.document || !result.partnerDocument) {
    const cnpj = !result.document ? line.match(CNPJ_REGEX)?.[0] : null;
    if (cnpj) {
      result.document = cnpj;
      result.personType = PERSON_TYPES.COMPANY;
      usedLines.add(line);
      return true;
    }

    const cpf = line.match(CPF_REGEX)?.[0];
    if (cpf && !isBarePhoneLine(line)) {
      if (!result.document) {
        result.document = cpf;
        result.personType = PERSON_TYPES.INDIVIDUAL;
      } else if (onlyDigits(cpf) !== onlyDigits(result.document)) {
        result.partnerDocument = cpf;
        result.isCouple = true;
      }
      usedLines.add(line);
      return true;
    }
  }

  if (!result.city || !result.state) {
    const cityState = line.match(CITY_STATE_REGEX);
    if (cityState) {
      const city = cityState[1].trim();
      const state = normalizeState(cityState[2]);
      if (!result.city && city.length > 2) result.city = city;
      if (!result.state && state) result.state = state;
      usedLines.add(line);
      return true;
    }
  }

  if (!result.address && /(rua|av\.?|avenida|travessa|alameda|rod\.?|estrada|logradouro)/i.test(line)) {
    result.address = line;
    usedLines.add(line);
    return true;
  }

  if (!result.eventDate) {
    const eventDate = normalizeEventDate(line);
    if (eventDate) {
      result.eventDate = eventDate;
      usedLines.add(line);
      return true;
    }
  }

  if (!result.eventTime && /[:hH]/.test(line)) {
    const eventTime = normalizeEventTime(line);
    if (eventTime) {
      result.eventTime = eventTime;
      usedLines.add(line);
      return true;
    }
  }

  return false;
}

function looksLikeName(line) {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 100) return false;
  if (EMAIL_REGEX.test(trimmed) || CPF_REGEX.test(trimmed) || CNPJ_REGEX.test(trimmed) || PHONE_REGEX.test(trimmed)) {
    return false;
  }
  if (INSTAGRAM_REGEX.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (onlyDigits(trimmed).length >= 8) return false;
  if (/(rua|av\.?|avenida|travessa|alameda|rod\.?|estrada|logradouro)\b/i.test(trimmed)) {
    return false;
  }

  const letterCount = (trimmed.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (letterCount < 3 || letterCount / trimmed.length < 0.45) return false;

  return true;
}

function splitInputLines(text = '') {
  const rawLines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rawLines.length !== 1) return rawLines;

  const singleLine = rawLines[0];
  if (looksLikeName(singleLine) && !EMAIL_REGEX.test(singleLine) && !PHONE_REGEX.test(singleLine)) {
    return [singleLine];
  }

  return rawLines;
}

export function parseQuickClientText(text = '') {
  const result = {
    name: '',
    personType: PERSON_TYPES.INDIVIDUAL,
    document: '',
    isCouple: false,
    partnerName: '',
    partnerDocument: '',
    whatsapp: '',
    email: '',
    instagram: '',
    address: '',
    city: '',
    state: '',
    eventDate: '',
    eventTime: '',
    eventLocation: '',
    eventCity: '',
    eventState: '',
    notes: '',
  };

  const lines = splitInputLines(text);

  if (!lines.length) return result;

  const unlabeledLines = [];
  const usedLines = new Set();

  lines.forEach((line) => {
    const labeledMatch = line.match(/^([^:：\-]+)\s*[:：\-]\s*(.+)$/);
    if (labeledMatch) {
      const field = detectField(labeledMatch[1]);
      if (field) {
        assignField(result, field, labeledMatch[2].trim());
        usedLines.add(line);
        return;
      }
    }

    unlabeledLines.push(line);
  });

  if (!result.name && unlabeledLines.length && looksLikeName(unlabeledLines[0])) {
    result.name = unlabeledLines[0];
    usedLines.add(unlabeledLines[0]);
  }

  unlabeledLines.forEach((line) => {
    if (usedLines.has(line)) return;
    extractFromLine(line, result, usedLines);
  });

  if (!result.name) {
    const nameCandidate = unlabeledLines.find((line) => !usedLines.has(line) && looksLikeName(line));
    if (nameCandidate) {
      result.name = nameCandidate;
      usedLines.add(nameCandidate);
    }
  }

  if (result.whatsapp && !result.phone) {
    result.phone = result.whatsapp;
  }

  applyCoupleCpfsFromText(text, result);

  if (result.isCouple || result.partnerDocument || result.partnerName) {
    result.isCouple = true;
    applyCoupleNameSplit(result);
  }

  if (!result.city && result.eventCity) {
    result.city = result.eventCity;
  }

  if (!result.state && result.eventState) {
    result.state = result.eventState;
  }

  const leftover = unlabeledLines.filter((line) => !usedLines.has(line));
  if (leftover.length) {
    const extra = leftover.join('\n');
    result.notes = result.notes ? `${result.notes}\n${extra}` : extra;
  }

  return result;
}
