/**
 * A component for displaying an OAuthUser, it's L2 address pubkey, and its transactions.
 * Displays the OAuthUser's service, username, name, profile picture, and description with a link to the user's profile.
 * This component fetches the user from workspace.foundOAuthUsers by calling WorkspaceStateManager.findOAuthUser() and displays the contents in a OAuth2UserProfileCard. 
 * Then it fetches the user's transactions and displays them in an AddressPresenter.
 */

import React, { useEffect, useState } from 'react';
import CircularProgress from '@mui/material/CircularProgress';

import { OAuth2UserProfileCard } from '../OAuth2UserDisplays/OAuth2UserProfileCard';
import { AddressPresenter } from './AddressPresenter';
import {OAuthUserAuxillaryInfo} from '../../services/messages/Layer2OAuthManager/Common/OAuthUserAuxillaryInfo';
import { WorkspaceContext } from '../../context/WorkspaceContext';
import { ExplorerContext } from '../../context/ExplorerStateContext';
import { buildStandardizedProfileUrl } from '../../utils/OAuthHelperUtils';
import { useParams } from 'react-router-dom';


class OAuth2UserProfilePresenterProps {
    service: string = "";
    username: string = "";
}

export function OAuth2UserProfilePresenterFromRoute() {
    const { service, username } = useParams();
    return <OAuth2UserProfilePresenter service={service as string} username={username as string}/>;
}

export function OAuth2UserProfilePresenter(props: OAuth2UserProfilePresenterProps) {
    const { service, username } = props;

    const { workspace, workspaceStateManager } = React.useContext(WorkspaceContext);
    const [isUserLoaded, setIsUserLoaded] = useState<boolean>(false);

    const [oauthUser, setOAuthUser] = useState<OAuthUserAuxillaryInfo | null>(null);

    loadOAuthUser();

    function loadOAuthUser() {
        // Fetch the OAuthUser
        const profileUrl: string = buildStandardizedProfileUrl(service, username);
        if (workspace?.foundOAuthUsers?.get(profileUrl) != null) {
            if (oauthUser == null) {
                setOAuthUser(workspace?.foundOAuthUsers?.get(profileUrl) as OAuthUserAuxillaryInfo);
                setIsUserLoaded(true);
            }
        } else {
            workspaceStateManager?.findOAuthUser(profileUrl);
        }
    }

    useEffect(() => {
        loadOAuthUser();
    }, [workspace]);

    return (
        (isUserLoaded && oauthUser) ? (
            <div>
                <OAuth2UserProfileCard
                    user={oauthUser.user}
                />
                <AddressPresenter
                    address={oauthUser?.layer2_address_pubkey || ""}
                />
            </div>
        ) : (
            <CircularProgress />
        )
    );
}
