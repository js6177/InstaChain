// For normalizing profile urls (Convert to lowercase, remove the protocol (http:// or https://), removing www, remove trailing slashes)
export function standardizeProfileUrl(url: string): string {
	return url
		.toLowerCase()
		.replace(/(^\w+:|^)\/\//, "")
		.replace("www.", "")
		.replace(/\/$/, "");
}

export function buildTwitterUrl(username: string): string {
	return `https://x.com/${username}`;
}
