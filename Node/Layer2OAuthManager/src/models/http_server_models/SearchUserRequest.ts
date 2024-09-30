// Keyword is the search keyword
// If username is set to true, search for the keyword in the username field
// If profile_url is set to true, search for the keyword in the profile_url field
// Both username and profile_url can be set to true

// Currently, username and profile_url are ignored and the keyword is searched in the username field only
export interface SearchUserRequest {
    keyword: string;
    username: boolean;
    profile_url: boolean;
}