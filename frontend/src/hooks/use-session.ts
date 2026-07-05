import { create } from 'zustand';
import { setAuthTokenGetter } from '@/api-client';

type Role = 'client' | 'worker' | 'admin' | null;
type Lang = 'fr' | 'en';

const storageKeys = {
  role: 'wrtfm_role',
  lang: 'wrtfm_lang',
  token: 'wrtfm_token',
  legacyRole: 'cae_role',
  legacyLang: 'cae_lang',
  legacyToken: 'cae_token',
};

interface SessionState {
  role: Role;
  lang: Lang;
  token: string | null;
  setRole: (role: Role) => void;
  setLang: (lang: Lang) => void;
  setToken: (token: string | null) => void;
  login: (role: Role, token: string) => void;
  logout: () => void;
}

const getInitialRole = (): Role => {
  const role = localStorage.getItem(storageKeys.role) ?? localStorage.getItem(storageKeys.legacyRole);
  return (role === 'client' || role === 'worker' || role === 'admin') ? role : null;
};

const getInitialLang = (): Lang => {
  const lang = localStorage.getItem(storageKeys.lang) ?? localStorage.getItem(storageKeys.legacyLang);
  return lang === 'en' ? 'en' : 'fr';
};

const getInitialToken = (): string | null => {
  return localStorage.getItem(storageKeys.token) ?? localStorage.getItem(storageKeys.legacyToken);
};

// Wire the token getter once on module load
const initialToken = getInitialToken();
if (initialToken) {
  setAuthTokenGetter(() => localStorage.getItem(storageKeys.token) ?? localStorage.getItem(storageKeys.legacyToken));
}

export const useSession = create<SessionState>((set: any) => ({
  role: getInitialRole(),
  lang: getInitialLang(),
  token: getInitialToken(),

  setRole: (role: Role) => {
    if (role) localStorage.setItem(storageKeys.role, role);
    else localStorage.removeItem(storageKeys.role);
    localStorage.removeItem(storageKeys.legacyRole);
    set({ role });
  },

  setLang: (lang: Lang) => {
    localStorage.setItem(storageKeys.lang, lang);
    localStorage.removeItem(storageKeys.legacyLang);
    set({ lang });
  },

  setToken: (token: string | null) => {
    if (token) {
      localStorage.setItem(storageKeys.token, token);
      localStorage.removeItem(storageKeys.legacyToken);
      setAuthTokenGetter(() => localStorage.getItem(storageKeys.token));
    } else {
      localStorage.removeItem(storageKeys.token);
      localStorage.removeItem(storageKeys.legacyToken);
      setAuthTokenGetter(null);
    }
    set({ token });
  },

  login: (role: Role, token: string) => {
    if (role) localStorage.setItem(storageKeys.role, role);
    localStorage.setItem(storageKeys.token, token);
    localStorage.removeItem(storageKeys.legacyRole);
    localStorage.removeItem(storageKeys.legacyToken);
    setAuthTokenGetter(() => localStorage.getItem(storageKeys.token));
    set({ role, token });
  },

  logout: () => {
    localStorage.removeItem(storageKeys.role);
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.legacyRole);
    localStorage.removeItem(storageKeys.legacyToken);
    setAuthTokenGetter(null);
    set({ role: null, token: null });
  },
}));
