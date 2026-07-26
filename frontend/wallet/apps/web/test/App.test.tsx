/// <reference types="vitest/browser" />

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import App from "@/App";

test("app loads", async () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	const screen = await render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<App />
			</MemoryRouter>
		</QueryClientProvider>,
	);

	const branding = screen.getByText("OpenL2", { exact: true });
	await expect.element(branding).toBeVisible();

	const welcomeText = screen.getByText(/OpenL2 Web Wallet/i);
	await expect.element(welcomeText).toBeVisible();
});
