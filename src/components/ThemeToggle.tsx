import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "valeon-tts-theme";

type ThemeName = "light" | "dark";

const getInitialTheme = (): ThemeName => {
	if (typeof window === "undefined") {
		return "light";
	}
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	if (stored === "light" || stored === "dark") {
		return stored;
	}
	if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
		return "dark";
	}
	return "light";
};

const ThemeToggle = () => {
	const [theme, setTheme] = useState<ThemeName>(getInitialTheme);

	useEffect(() => {
		document.documentElement.setAttribute("data-theme", theme);
		localStorage.setItem(THEME_STORAGE_KEY, theme);
	}, [theme]);

	const isDark = theme === "dark";

	return (
		<label
			className="swap swap-rotate btn btn-square btn-sm btn-primary"
			aria-label="Toggle theme"
			title="Toggle theme"
		>
			<input
				type="checkbox"
				checked={isDark}
				aria-label="Toggle theme"
				onChange={(event) => setTheme(event.target.checked ? "dark" : "light")}
			/>
			<i className="swap-on fa-solid fa-moon" aria-hidden="true" />
			<i className="swap-off fa-solid fa-sun" aria-hidden="true" />
		</label>
	);
};

export default ThemeToggle;
