import { t } from "elysia";

// Keyword is the search keyword
// If username is set to true, search for the keyword in the username field
// If profile_url is set to true, search for the keyword in the profile_url field
// Both username and profile_url can be set to true

// Currently, username and profile_url are ignored and the keyword is searched in the username field only
export const SearchUserRequest = t.Object({
	keyword: t.String(),
	username: t.Boolean(),
	profile_url: t.Boolean(),
});

export type SearchUserRequest = typeof SearchUserRequest.static;
