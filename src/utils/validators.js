import { PERSON_TYPES } from './constants.js';

export function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone) {
  const digits = onlyDigits(phone);
  return digits.length >= 10 && digits.length <= 11;
}

function isValidCPF(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  return remainder === Number(digits[10]);
}

function isValidCNPJ(cnpj) {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * weights1[i];
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== Number(digits[12])) return false;

  sum = 0;
  for (let i = 0; i < 13; i += 1) sum += Number(digits[i]) * weights2[i];
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  return digit2 === Number(digits[13]);
}

export function isValidDocument(document, personType) {
  const digits = onlyDigits(document);
  if (!digits) return true;

  if (personType === PERSON_TYPES.COMPANY) {
    return isValidCNPJ(digits);
  }

  return isValidCPF(digits);
}

export function formatPhone(value = '') {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatDocument(value = '', personType = PERSON_TYPES.INDIVIDUAL) {
  const digits = onlyDigits(value);

  if (personType === PERSON_TYPES.COMPANY) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) {
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    }
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function validateClientForm(data) {
  const errors = {};

  if (!data.name?.trim()) {
    errors.name = 'O nome é obrigatório.';
  }

  if (!data.personType) {
    errors.personType = 'Selecione o tipo de pessoa.';
  }

  if (data.document && !isValidDocument(data.document, data.personType)) {
    errors.document =
      data.personType === PERSON_TYPES.COMPANY
        ? 'CNPJ inválido.'
        : 'CPF inválido.';
  }

  if (data.email && !isValidEmail(data.email)) {
    errors.email = 'E-mail inválido.';
  }

  if (data.phone && !isValidPhone(data.phone)) {
    errors.phone = 'Telefone inválido.';
  }

  if (data.whatsapp && !isValidPhone(data.whatsapp)) {
    errors.whatsapp = 'WhatsApp inválido.';
  }

  const isCouple = data.isCouple === true || data.isCouple === 'true';

  if (isCouple && data.personType !== PERSON_TYPES.COMPANY) {
    if (!data.partnerName?.trim()) {
      errors.partnerName = 'Informe o nome completo do segundo noivo(a).';
    }

    if (!data.partnerDocument?.trim()) {
      errors.partnerDocument = 'Informe o CPF do segundo noivo(a).';
    } else if (!isValidDocument(data.partnerDocument, PERSON_TYPES.INDIVIDUAL)) {
      errors.partnerDocument = 'CPF do segundo noivo(a) inválido.';
    }
  }

  return errors;
}
