/**
 * A component for displaying an OAuthUser.
 * Displays the OAuthUser's service, username, name, profile picture, and description with a link to the user's profile.
 * This component displays the contents in a OAuth2SingleLineUserProfileCard.
 */

import React, { useEffect, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';

import { OAuth2SingleLineUserProfileCard } from '../OAuth2UserDisplays/OAuth2SingleLineUserProfileCard';
import { OAuthUser } from '../../services/messages/Layer2OAuthManager/Response/OAuthResponse';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { ExplorerContext } from '../../context/ExplorerStateContext';

class OAuth2UserSearchResultPresenterProps {
    searchString: string = "";
}

export function OAuth2UserSearchResultPresenter(props: OAuth2UserSearchResultPresenterProps) {
    const { searchString } = props;

    const { workspace, workspaceStateManager } = React.useContext(WorkspaceContext);
    const { explorerState, explorerStateManager } = React.useContext(ExplorerContext);
    const [isSearchFinishedLoading, setIsSearchFinishedLoading] = useState<boolean>(false);

    const [oauthUsers, setOAuthUsers] = useState<OAuthUser[] | null>(null);

    loadOAuthUser();

    function loadOAuthUser() {
        // Fetch the OAuthUser
        if (workspace?.searchedOAuthUsers?.get(searchString) != null) {
            if (oauthUsers == null) {
                setOAuthUsers(workspace?.searchedOAuthUsers?.get(searchString) as OAuthUser[]);
                setIsSearchFinishedLoading(true);
            }
        } else {
            workspaceStateManager?.searchOAuthUser(searchString);
        }
    }

    useEffect(() => {
        loadOAuthUser();
    }, [workspace]);

    return (
        isSearchFinishedLoading ? (
            oauthUsers && oauthUsers.map((oauthUser: OAuthUser) => {
                return (
                    <OAuth2SingleLineUserProfileCard
                        user={oauthUser}
                    />
                );
            })
        ) : (
            <CircularProgress />
        )
    );
}