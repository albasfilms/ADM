export const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

export const CLIENT_STATUS_LABELS = {
  [CLIENT_STATUS.ACTIVE]: 'Ativo',
  [CLIENT_STATUS.INACTIVE]: 'Inativo',
};

export const PERSON_TYPES = {
  INDIVIDUAL: 'individual',
  COMPANY: 'company',
};

export const PERSON_TYPE_LABELS = {
  [PERSON_TYPES.INDIVIDUAL]: 'Pessoa física',
  [PERSON_TYPES.COMPANY]: 'Pessoa jurídica',
};

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

export const PAGE_SIZE = 20;

export const CONTRACT_STATUS = {
  BUDGET: 'budget',
  AWAITING_SIGNATURE: 'awaiting_signature',
  AWAITING_ENTRY: 'awaiting_entry',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  FINISHED: 'finished',
  PAID_OFF: 'paid_off',
  CANCELLED: 'cancelled',
};

export const CONTRACT_STATUS_LABELS = {
  [CONTRACT_STATUS.BUDGET]: 'Orçamento',
  [CONTRACT_STATUS.AWAITING_SIGNATURE]: 'Aguardando assinatura',
  [CONTRACT_STATUS.AWAITING_ENTRY]: 'Aguardando entrada',
  [CONTRACT_STATUS.CONFIRMED]: 'Confirmado',
  [CONTRACT_STATUS.IN_PROGRESS]: 'Em andamento',
  [CONTRACT_STATUS.FINISHED]: 'Finalizado',
  [CONTRACT_STATUS.PAID_OFF]: 'Quitado',
  [CONTRACT_STATUS.CANCELLED]: 'Cancelado',
};

export const SERVICE_TYPES = {
  STORYMAKER: 'storymaker',
  FILMMAKER: 'filmmaker',
  PHOTOGRAPHY: 'photography',
  TEASER: 'teaser',
  WEDDING: 'wedding',
  PORTRAIT: 'portrait',
  CORPORATE: 'corporate_event',
  BIRTHDAY: 'birthday',
  CONTENT: 'content_production',
  OTHER: 'other',
};

export const SERVICE_TYPE_LABELS = {
  [SERVICE_TYPES.STORYMAKER]: 'Storymaker',
  [SERVICE_TYPES.FILMMAKER]: 'Filmmaker',
  [SERVICE_TYPES.PHOTOGRAPHY]: 'Fotografia',
  [SERVICE_TYPES.TEASER]: 'Teaser',
  [SERVICE_TYPES.WEDDING]: 'Casamento',
  [SERVICE_TYPES.PORTRAIT]: 'Ensaio',
  [SERVICE_TYPES.CORPORATE]: 'Evento corporativo',
  [SERVICE_TYPES.BIRTHDAY]: 'Aniversário',
  [SERVICE_TYPES.CONTENT]: 'Produção de conteúdo',
  [SERVICE_TYPES.OTHER]: 'Outro',
};

export const PAYMENT_METHODS = {
  PIX: 'pix',
  CASH: 'cash',
  TRANSFER: 'transfer',
  CREDIT_CARD: 'credit_card',
  DEBIT_CARD: 'debit_card',
  BOLETO: 'boleto',
  OTHER: 'other',
};

export const PAYMENT_METHOD_LABELS = {
  [PAYMENT_METHODS.PIX]: 'Pix',
  [PAYMENT_METHODS.CASH]: 'Dinheiro',
  [PAYMENT_METHODS.TRANSFER]: 'Transferência',
  [PAYMENT_METHODS.CREDIT_CARD]: 'Cartão de crédito',
  [PAYMENT_METHODS.DEBIT_CARD]: 'Cartão de débito',
  [PAYMENT_METHODS.BOLETO]: 'Boleto',
  [PAYMENT_METHODS.OTHER]: 'Outro',
};

export const INSTALLMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  PARTIAL: 'partial',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
};

export const INSTALLMENT_STATUS_LABELS = {
  [INSTALLMENT_STATUS.PENDING]: 'Pendente',
  [INSTALLMENT_STATUS.PAID]: 'Pago',
  [INSTALLMENT_STATUS.PARTIAL]: 'Pago parcialmente',
  [INSTALLMENT_STATUS.OVERDUE]: 'Atrasado',
  [INSTALLMENT_STATUS.CANCELLED]: 'Cancelado',
};
