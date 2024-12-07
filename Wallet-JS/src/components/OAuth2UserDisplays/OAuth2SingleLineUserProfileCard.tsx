import React from 'react'
import { Avatar, Box, Card, Typography, SvgIcon } from '@mui/material'
import { Twitter as TwitterIcon, GitHub as GitHubIcon } from '@mui/icons-material';
import { OAuthUser } from '../../services/messages/Layer2OAuthManager/Response/OAuthResponse';
import {ExplorerLinkBuilder} from '../../utils/RouterUtils';

// Define the props for our component
export interface OAuth2SingleLineUserProfileCardProps {
    user: OAuthUser;
}

function renderServiceIcon(service: string): JSX.Element | null {
    switch (service) {
      case 'twitter':
        return <TwitterIcon color="primary"/>;
      case 'github':
        return <GitHubIcon color="action" />;
      default:
        return (<div></div>);
    }
}

export function OAuth2SingleLineUserProfileCard(props: OAuth2SingleLineUserProfileCardProps) {
  // Get the appropriate icon for the service
  const ServiceIcon = renderServiceIcon(props.user.service_name);
  const explorerProfileLink = ExplorerLinkBuilder.buildLayer2OAuthUserLink(props.user.service_name, props.user.username);
  console.log(explorerProfileLink);

  return (
    <Card sx={{ display: 'flex', alignItems: 'center', p: 1, maxWidth: 400 }}>
      <Box sx={{ position: 'relative', mr: 2 }}>
        <a href={explorerProfileLink} target="_blank" rel="noopener noreferrer">
          <Avatar src={props.user.profile_pic_url} alt={props.user.name} sx={{ width: 48, height: 48 }} />
        </a>
        <Avatar
          sx={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 20,
            height: 20,
            bgcolor: 'background.paper',
          }}
        >
          {ServiceIcon}
        </Avatar>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Typography variant="body2" color="text.secondary">
            <a href={"https://" + props.user.profile_url} target="_blank" rel="noopener noreferrer">
                @{props.user.username}
            </a>
        </Typography>
      </Box>
    </Card>
  )
}