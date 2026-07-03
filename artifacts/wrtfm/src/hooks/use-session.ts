import { create } from 'zustand';
import { setAuthTokenGetter } from '@workspace/api-client-react';

type Role = 'client' | 'worker' | 'admin' | null;
type Lang = 'fr' | 'en';

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
  const role = localStorage.getItem('wrtfm_role');
  return (role === 'client' || role === 'worker' || role === 'admin') ? role : null;
};

const getInitialLang = (): Lang => {
  const lang = localStorage.getItem('wrtfm_lang');
  return lang === 'en' ? 'en' : 'fr';
};

const getInitialToken = (): string | null => {
  return localStorage.getItem('wrtfm_token');
};

// Wire the token getter once on module load
const initialToken = getInitialToken();
if (initialToken) {
  setAuthTokenGetter(() => localStorage.getItem('wrtfm_token'));
}

export const useSession = create<SessionState>((set: any) => ({
  role: getInitialRole(),
  lang: getInitialLang(),
  token: getInitialToken(),

  setRole: (role: Role) => {
    if (role) localStorage.setItem('wrtfm_role', role);
    else localStorage.removeItem('wrtfm_role');
    set({ role });
  },

  setLang: (lang: Lang) => {
    localStorage.setItem('wrtfm_lang', lang);
    set({ lang });
  },

  setToken: (token: string | null) => {
    if (token) {
      localStorage.setItem('wrtfm_token', token);
      setAuthTokenGetter(() => localStorage.getItem('wrtfm_token'));
    } else {
      localStorage.removeItem('wrtfm_token');
      setAuthTokenGetter(null);
    }
    set({ token });
  },

  login: (role: Role, token: string) => {
    if (role) localStorage.setItem('wrtfm_role', role);
    localStorage.setItem('wrtfm_token', token);
    setAuthTokenGetter(() => localStorage.getItem('wrtfm_token'));
    set({ role, token });
  },

  logout: () => {
    localStorage.removeItem('wrtfm_role');
    localStorage.removeItem('wrtfm_token');
    setAuthTokenGetter(null);
    set({ role: null, token: null });
  },
}));
