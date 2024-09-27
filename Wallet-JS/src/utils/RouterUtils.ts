const HomePath: string = '/';
const WalletPath: string = '/wallet';
const ExplorerPath: string = '/explorer';
const AuditPath: string = '/audit';
const OAuth2Path: string = '/oauth2';

const ExplorerLayer2AddressPathSegment: string = 'address';
const ExplorerLayer2TransactionPathSegment: string = 'transaction';
const ExplorerLayer1DepositAddressPathSegment: string = 'deposit';

const ExplorerLayer2AddressPath: string = `${ExplorerPath}/${ExplorerLayer2AddressPathSegment}`;
const ExplorerLayer2TransactionPath: string = `${ExplorerPath}/${ExplorerLayer2TransactionPathSegment}`;
const ExplorerLayer1DepositAddressPath: string = `${ExplorerPath}/${ExplorerLayer1DepositAddressPathSegment}`;

export class ExplorerLinkBuilder {
    static buildLayer2AddressLink(address: string): string {
        return `${ExplorerLayer2AddressPath}/${address}`;
    }

    static buildLayer2TransactionLink(transactionID: string): string {
        return `${ExplorerLayer2TransactionPath}/${transactionID}`;
    }

    static buildLayer1DepositAddressLink(address: string): string {
        return `${ExplorerLayer1DepositAddressPath}/${address}`;
    }
}

export {
    HomePath,
    WalletPath,
    ExplorerPath,
    AuditPath,
    OAuth2Path,
    ExplorerLayer2AddressPathSegment,
    ExplorerLayer2TransactionPathSegment,
    ExplorerLayer1DepositAddressPathSegment,
    ExplorerLayer2AddressPath,
    ExplorerLayer2TransactionPath,
    ExplorerLayer1DepositAddressPath
};


