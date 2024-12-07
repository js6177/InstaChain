// For normalizing profile urls (Convert to lowercase, remove the protocol (http:// or https://), removing www, remove trailing slashes)
export function standardizeProfileUrl(url: string): string {
    return url.toLowerCase()
                .replace(/(^\w+:|^)\/\//, '')
                .replace('www.', '')
                .replace(/\/$/, '');
}

export function buildTwitterUrl(username: string): string {
    return `https://x.com/${username}`;
}

export function buildGithubUrl(username: string): string {
    return `https://github.com/${username}`;
}

export function buildProfileUrl(service: string, username: string): string {
    switch (service) {
        case 'twitter':
            return buildTwitterUrl(username);
        case 'github':
            return buildGithubUrl(username);
        default:
            return '';
    }
}

export function buildStandardizedProfileUrl(service: string, username: string): string {
    return standardizeProfileUrl(buildProfileUrl(service, username));
}

