// This class is responsible for maintaining a list of wallets and OAuth users
// And provides a way for creating, storing, and retrieving them. As well as specifiying the main wallet.

import { Wallet } from "../utils/wallet";
import { OAuthUser, UserKeys } from "../services/messages/Layer2OAuthManager/Response/OAuthResponse";
import { removeLayer2OAuthAuthorizationTokenFromLocalStorage, saveLayer2OAuthAuthorizationTokenToLocalStorage} from "../state_managers/LocalStorageManager";
import { Layer2OAuthToken } from "../services/messages/Layer2OAuthManager/Request/AuthorizeWithLayer2AuthTokenRequest";

export class WalletManager {
    public wallets: Map<string, Wallet>;
    public mainWalletId: string | null;
    public oauthusers: Map<string, OAuthUser>; // Key: Oauth user id, Value: OAuthUser

    constructor() {
        this.wallets = new Map();
        this.mainWalletId = null;
        this.oauthusers = new Map();
    }

    createNewWallet(mneumonic: string, setAsMainWallet: boolean = true, walletId: string = '') {
        const wallet = new Wallet(mneumonic, walletId);
        this.wallets.set(wallet.uid, wallet);
        if (setAsMainWallet) {
            this.setMainWalletId(wallet.uid);
        }
        return wallet;
    }

    // Add an OAuth user to the wallet manager. Create a new wallet if a wallet doesn't exist with the user's _id.
    // Update the wallet if it does exist.
    addOAuthUser(oauthUser: OAuthUser, userKeys: UserKeys, setAsMainWallet: boolean = true) {
        const oauthUserId: string = oauthUser._id;
        this.oauthusers.set(oauthUserId, oauthUser);

        // Create a wallet for the user, with the wallet id being the oauthUserId
        if(userKeys !== null){
            const wallet = new Wallet(userKeys.l2_address_mneumonic, oauthUserId);
            this.wallets.set(oauthUserId, wallet);

            if (setAsMainWallet) {
                this.setMainWalletId(oauthUserId);
            }
        }
        else{
            console.log("setOAuthUser: user_keys is null");
        }
        //Store layer2_authorization_token in local storage
        const layer2OAuthToken: Layer2OAuthToken = { layer2_authorization_token: oauthUser.layer2_authorization_token, oauth_service: oauthUser.service_name };
        saveLayer2OAuthAuthorizationTokenToLocalStorage(layer2OAuthToken);
    }

    // Remove the OAuth user and wallet associated with the oauthUserId
    // If no oauthUserId is provided, remove the main wallet
    logoutOAuthUser(oauthUserId: string | null) {
        if(oauthUserId === null){
            oauthUserId = this.getMainWalletId() as string;
        }
        this.oauthusers.delete(oauthUserId);
        this.wallets.delete(oauthUserId);
        removeLayer2OAuthAuthorizationTokenFromLocalStorage();

        // If the main wallet is removed, set the main wallet to the first wallet in the wallets map
        if (this.getMainWalletId() === oauthUserId) {
            if(this.wallets.size > 0){
                const firstWallet = this.wallets.keys().next().value;
                this.setMainWalletId(firstWallet);
            }else{
                this.setMainWalletId(null);
            }
        }
    }

    getWalletCount(): number {
        return this.wallets.size || 0;
    }

    getWallet(walletId: string) {
        return this.wallets.get(walletId);
    }

    setMainWalletId(walletId: string | null) {
        this.mainWalletId = walletId;
    }

    getMainWalletId() {
        return this.mainWalletId;
    }
    
    getMainWallet() : Wallet | null {
        return this.wallets.get(this.getMainWalletId() as string) || null;
    }
    
    getMainWalletAddress() {
        const wallet = this.wallets.get(this.getMainWalletId() as string);
        if (wallet) {
            return wallet.getMainAddress();
        }
        return null;
    }

    getMainWalletAddressPubkey() : string | null {
        return this.getMainWalletAddress()?.getPublicKeyString() || null;
    }

    getOAuthUser(oauthUserId: string) : OAuthUser | null {
        return this.oauthusers.get(oauthUserId) || null;
    }

    // Returns the OAuth user of the main wallet, or null if the wallet is not created with an OAuth user (i.e. generated from "Create Wallet" button)
    getMainWalletOAuthUser() : OAuthUser | null {
        return this.oauthusers.get(this.getMainWalletId() as string) || null;
    }
}