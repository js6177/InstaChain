export const ROUTES = {
    // Router definition paths (relative to /explorer)
    EXPLORER_SEARCH: 'search',
    EXPLORER_ADDRESS: 'address/:addressId',
    EXPLORER_TRANSACTION: 'transaction/:txId',
    
    // Route builders for navigation and links
    buildExplorerAddress: (addressId: string) => `/explorer/address/${addressId}`,
    buildExplorerTransaction: (txId: string) => `/explorer/transaction/${txId}`,
    buildExplorerSearch: (query: string) => `/explorer/search?q=${encodeURIComponent(query)}`
} as const;
