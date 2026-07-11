const state = {
  authUser: null,
  profile: null,
  authReady: false,
  sidebarOpen: false,
};

const listeners = new Set();

export function getState() {
  return { ...state };
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener(getState()));
}

export function setAuthUser(user) {
  state.authUser = user;
  notify();
}

export function setProfile(profile) {
  state.profile = profile;
  notify();
}

export function setAuthReady(ready) {
  state.authReady = ready;
  notify();
}

export function setSidebarOpen(open) {
  state.sidebarOpen = open;
  notify();
}

export function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  notify();
}

export function closeSidebar() {
  state.sidebarOpen = false;
  notify();
}

export function getCurrentUser() {
  return state.profile
    ? { ...state.profile, uid: state.authUser?.uid }
    : null;
}

export function isAuthenticated() {
  return Boolean(state.authUser && state.profile?.active);
}
