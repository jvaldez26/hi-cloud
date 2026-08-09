import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TEMAS_SIDEBAR = ['nube', 'marea', 'indigo', 'bosque', 'cemento', 'ciruela', 'bronce'] as const;
export type TemaSidebar = typeof TEMAS_SIDEBAR[number];

interface ThemeState {
  isDark:         boolean;
  temaSidebar:    TemaSidebar;
  toggle:         () => void;
  setTemaSidebar: (t: TemaSidebar) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark:         false,
      temaSidebar:    'nube',
      toggle:         () => set({ isDark: !get().isDark }),
      setTemaSidebar: (t) => set({ temaSidebar: t }),
    }),
    { name: 'hicloud-theme' },
  ),
);
