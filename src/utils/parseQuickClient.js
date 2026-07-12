import { BRAZILIAN_STATES, PERSON_TYPES } from './constants.js';
import { onlyDigits } from './validators.js';

const FIELD_LABELS = {
  name: ['nome', 'name', 'cliente', 'noivos', 'casal'],
  cpf: ['cpf'],
  cnpj: ['cnpj'],
  document: ['documento', 'doc'],
  phone: ['telefone', 'tel', 'celular', 'fone', 'cel'],
  whatsapp: ['whatsapp', 'zap', 'wpp', 'whats', 'wa'],
  email: ['email', 'e-mail', 'e mail', 'mail'],
  instagram: ['instagram', 'insta', 'ig'],
  address: ['endereco', 'endereço', 'rua', 'logradouro', 'address', 'av', 'avenida'],
  city: ['cidade', 'city', 'municipio', 'município'],
  state: ['estado', 'uf', 'state'],
  notes: ['observacoes', 'observações', 'obs', 'notas', 'anotacoes', 'anotações', 'info', 'informacoes', 'informações'],
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

function detectField(label) {
  const normalized = normalizeText(label);

  for (const [field, labels] of Object.entries(FIELD_LABELS)) {
    if (labels.some((item) => normalized === item || normalized.startsWith(`${item} `))) {
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
  if (!value) return;

  if (field === 'cpf') {
    result.document = value;
    result.personType = PERSON_TYPES.INDIVIDUAL;
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

  if (field === 'notes') {
    result.notes = result.notes ? `${result.notes}\n${value}` : value;
    return;
  }

  result[field] = value;
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

  if ((!result.whatsapp || !result.phone) && (PHONE_REGEX.test(line) || isBarePhoneLine(line))) {
    const phone = line.match(PHONE_REGEX)?.[0] || line;
    if (!result.whatsapp) {
      result.whatsapp = phone;
    } else if (!result.phone) {
      result.phone = phone;
    }
    usedLines.add(line);
    return true;
  }

  if (!result.document) {
    const cnpj = line.match(CNPJ_REGEX)?.[0];
    if (cnpj) {
      result.document = cnpj;
      result.personType = PERSON_TYPES.COMPANY;
      usedLines.add(line);
      return true;
    }

    const cpf = line.match(CPF_REGEX)?.[0];
    if (cpf && !isBarePhoneLine(line)) {
      result.document = cpf;
      result.personType = PERSON_TYPES.INDIVIDUAL;
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
    phone: '',
    whatsapp: '',
    email: '',
    instagram: '',
    address: '',
    city: '',
    state: '',
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

  const leftover = unlabeledLines.filter((line) => !usedLines.has(line));
  if (leftover.length) {
    const extra = leftover.join('\n');
    result.notes = result.notes ? `${result.notes}\n${extra}` : extra;
  }

  return result;
}
