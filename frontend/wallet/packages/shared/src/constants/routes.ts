export const ROUTES = {
    // Router definition paths (relative to /explorer)
    EXPLORER_SEARCH: 'search',
    EXPLORER_ADDRESS: 'address/:addressId',
    EXPLORER_TRANSACTION: 'transaction/:txId',
    EXPLORER_OAUTH_USER: ':service_name/:service_specific_id',
    
    // Route builders for navigation and links
    buildExplorerAddress: (addressId: string) => `/explorer/address/${addressId}`,
    buildExplorerTransaction: (txId: string) => `/explorer/transaction/${txId}`,
    buildExplorerSearch: (query: string) => `/explorer/search?q=${encodeURIComponent(query)}`,
    buildExplorerOAuthUser: (service: string, id: string) => `/explorer/${service}/${id}`
} as const;
