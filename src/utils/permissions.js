export const ROLES = {
  ADMIN: 'admin',
  COLLABORATOR: 'collaborator',
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Administrador',
  [ROLES.COLLABORATOR]: 'Colaborador',
};

export function isAdmin(user) {
  return user?.role === ROLES.ADMIN;
}

export function canManageSettings(user) {
  return isAdmin(user);
}

export function canDeleteContracts(user) {
  return isAdmin(user);
}

export function canDeleteClients(user) {
  return isAdmin(user);
}

export function canDeletePayments(user) {
  return isAdmin(user);
}

export function canWriteClients(user) {
  return Boolean(user?.active);
}

export function canRegisterPayments(user) {
  return Boolean(user?.active);
}
