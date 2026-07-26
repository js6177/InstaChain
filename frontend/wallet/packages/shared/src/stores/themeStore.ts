import { create } from "zustand";
import { persist } from "zustand/middleware";

export const Theme = {
	LIGHT: "light",
	DARK: "dark",
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

interface ThemeState {
	theme: Theme;
	toggleTheme: () => void;
	setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			theme:
				typeof window !== "undefined" &&
				window.matchMedia("(prefers-color-scheme: dark)").matches
					? Theme.DARK
					: Theme.LIGHT,
			toggleTheme: () =>
				set((state) => ({
					theme: state.theme === Theme.LIGHT ? Theme.DARK : Theme.LIGHT,
				})),
			setTheme: (theme: Theme) => set({ theme }),
		}),
		{
			name: "theme-storage",
		},
	),
);
