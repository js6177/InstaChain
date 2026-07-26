import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { webdriverio } from "@vitest/browser-webdriverio";
import { defineConfig } from "vitest/config";

const isDocker = process.env.VITEST_DOCKER === "1";

const dockerChromeProviderOptions = {
	capabilities: {
		"goog:chromeOptions": {
			binary: process.env.CHROME_BIN ?? "/usr/bin/chromium",
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				"--disable-gpu",
			],
		},
		"wdio:chromedriverOptions": {
			binary: process.env.CHROMEDRIVER ?? "/usr/bin/chromedriver",
		},
	},
};

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		{
			name: "watcher-count",
			configureServer(server) {
				server.watcher.on("ready", () => {
					const watched = server.watcher.getWatched();
					const fileCount = Object.values(watched).flat().length;
					const dirCount = Object.keys(watched).length;
					console.log(
						`\n[watcher] watching ${fileCount} files across ${dirCount} dirs\n`,
					);
				});
			},
		},
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		host: true,
		port: 5173,
		hmr: {
			clientPort: 5173,
		},
		sourcemapIgnoreList: false, // Ensure VS Code doesn't skip "internal" files
		watch: {
			ignored: [
				"**/node_modules/**",
				"**/backend/**", // Don't watch the backend from the frontend
				"**/dist/**",
				"**/.turbo/**", // Ignore Turborepo cache
			],
		},
	},
	build: { sourcemap: true },
	test: {
		coverage: {
			// istanbul instruments source at transform time, so it works with the
			// webdriverio browser provider (v8 coverage requires CDP/Playwright).
			provider: "istanbul",
			// 'text' prints the coverage summary to the console; 'cobertura' writes the XML report.
			reporter: ["text", "cobertura"],
			reportsDirectory: path.resolve(__dirname, "../../.coverage"),
			include: ["src/**"],
		},
		projects: [
			{
				extends: true,
				test: {
					name: "browser",
					setupFiles: ["./src/vitest.setup.ts"],
					include: ["test/**/*.{test,spec}.{tsx,jsx}"],
					browser: {
						enabled: true,
						// Non-headless mode leaves Vitest's loading overlay on top of the iframe,
						// which intercepts WebDriver clicks. Default to headless; set VITEST_HEADLESS=0 to debug visually.
						headless: process.env.VITEST_HEADLESS !== "0",
						viewport: { width: 1280, height: 720 },
						provider: webdriverio(isDocker ? dockerChromeProviderOptions : {}),
						instances: [{ browser: "chrome" }],
					},
				},
			},
			{
				extends: true,
				test: {
					name: "integration",
					setupFiles: ["./test/vitest.integration.setup.ts"],
					include: ["test/**/*.integration.test.ts"],
					environment: "node",
					testTimeout: 60_000,
				},
			},
		],
	},
});
