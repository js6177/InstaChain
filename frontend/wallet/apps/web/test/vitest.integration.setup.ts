/** Minimal globals required by the generated API client in non-browser Vitest runs. */
if (typeof globalThis.localStorage === "undefined") {
	const store = new Map<string, string>();
	globalThis.localStorage = {
		get length(): number {
			return store.size;
		},
		clear(): void {
			store.clear();
		},
		getItem(key: string): string | null {
			return store.get(key) ?? null;
		},
		key(index: number): string | null {
			return [...store.keys()][index] ?? null;
		},
		removeItem(key: string): void {
			store.delete(key);
		},
		setItem(key: string, value: string): void {
			store.set(key, value);
		},
	};
}
