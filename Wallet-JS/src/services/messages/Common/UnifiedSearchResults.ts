import SearchResultsResponse from "../Layer2Ledger/Responses/SearchResultsResponse";
import { SearchUserResponse } from "../Layer2OAuthManager/Response/SearchUserResponse";

export interface UnifiedSearchResults {
    layer2SearchResults: SearchResultsResponse | null;
    oauthUserSearchResults: SearchUserResponse | null;
}
