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
        await signOut(auth);
        setProfile(null);
        setAuthReady(true);
        return;
      }

      setProfile(profile);
    } catch (error) {
      console.error('[Auth] Erro ao carregar perfil:', error);
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
      await signOut(auth);
      throw new Error('Usuário sem permissão de acesso. Contate o administrador.');
    }

    if (!profile.active) {
      await signOut(auth);
      throw new Error('Sua conta está inativa. Contate o administrador.');
    }

    setProfile(profile);
    return profile;
  } catch (error) {
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
