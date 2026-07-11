import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config.js';
import {
  setAuthUser,
  setProfile,
  setAuthReady,
} from '../appState.js';

const AUTH_ERRORS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/too-many-requests': 'Muitas tentativas. Tente novamente mais tarde.',
  'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
};

function translateAuthError(code) {
  return AUTH_ERRORS[code] || 'Não foi possível completar a operação. Tente novamente.';
}

export async function loadUserProfile(uid) {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
}

function profileAccessError(uid, reason) {
  if (reason === 'missing') {
    return `Perfil não encontrado no Firestore. Crie o documento users/${uid} com role "admin" e active true.`;
  }
  if (reason === 'inactive') {
    return 'Sua conta está inativa. Contate o administrador.';
  }
  return 'Não foi possível validar seu perfil de acesso.';
}

function storeAuthError(message) {
  try {
    sessionStorage.setItem('auth_error', message);
  } catch {
    // ignore
  }
}

export function consumeAuthError() {
  try {
    const message = sessionStorage.getItem('auth_error');
    if (message) {
      sessionStorage.removeItem('auth_error');
      return message;
    }
  } catch {
    // ignore
  }
  return null;
}

export function initAuthListener() {
  return onAuthStateChanged(auth, async (firebaseUser) => {
    setAuthUser(firebaseUser);

    if (!firebaseUser) {
      setProfile(null);
      setAuthReady(true);
      return;
    }

    try {
      const profile = await loadUserProfile(firebaseUser.uid);

      if (!profile || !profile.active) {
        const message = !profile
          ? profileAccessError(firebaseUser.uid, 'missing')
          : profileAccessError(firebaseUser.uid, 'inactive');
        storeAuthError(message);
        await signOut(auth);
        setProfile(null);
        setAuthReady(true);
        return;
      }

      setProfile(profile);
    } catch (error) {
      console.error('[Auth] Erro ao carregar perfil:', error);
      const message =
        error.code === 'permission-denied'
          ? 'Acesso negado ao Firestore. Publique as regras completas e confira o documento users no Firebase.'
          : 'Erro ao carregar perfil. Verifique as regras do Firestore.';
      storeAuthError(message);
      await signOut(auth);
      setProfile(null);
    } finally {
      setAuthReady(true);
    }
  });
}

export async function login(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const profile = await loadUserProfile(credential.user.uid);

    if (!profile) {
      const message = profileAccessError(credential.user.uid, 'missing');
      storeAuthError(message);
      await signOut(auth);
      throw new Error(message);
    }

    if (!profile.active) {
      const message = profileAccessError(credential.user.uid, 'inactive');
      storeAuthError(message);
      await signOut(auth);
      throw new Error(message);
    }

    setProfile(profile);
    return profile;
  } catch (error) {
    if (error.code === 'permission-denied') {
      const message =
        'Acesso negado ao Firestore. Publique as regras completas e confira o documento users no Firebase.';
      storeAuthError(message);
      throw new Error(message);
    }
    if (error.code) {
      throw new Error(translateAuthError(error.code));
    }
    throw error;
  }
}

export async function logout() {
  await signOut(auth);
  setProfile(null);
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (error) {
    throw new Error(translateAuthError(error.code));
  }
}
