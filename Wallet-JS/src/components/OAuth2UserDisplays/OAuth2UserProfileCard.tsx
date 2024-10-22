import React from 'react';
import { OAuthUser } from "../../services/messages/Layer2OAuthManager/Response/OAuthResponse";
import { Card, CardContent, CardHeader, Avatar, Typography, Box } from '@mui/material';
import { Twitter as TwitterIcon, GitHub as GitHubIcon } from '@mui/icons-material';

export interface OAuth2UserProfileCardProps {
    user: OAuthUser;
}

export function OAuth2UserProfileCard(props: OAuth2UserProfileCardProps) {
      // Function to render the appropriate service icon
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

  return (
    <Card sx={{ maxWidth: 345, m: 2 }}>
      <CardHeader
        avatar={
          <Avatar src={props.user.profile_pic_url} alt={props.user.name} sx={{ width: 60, height: 60 }}>
            {props.user.name.charAt(0)}
          </Avatar>
        }
        action={
          <Box sx={{ mt: 1, mr: 1 }}>
            {renderServiceIcon(props.user.service_name)}
          </Box>
        }
        title={
          <Typography variant="h6" component="div">
            {props.user.name}
          </Typography>
        }
        subheader={           
          <a href={"https://" + props.user.profile_url} target="_blank" rel="noopener noreferrer">
            @${props.user.username}
          </a>
        }
      />
      <CardContent>
        <Typography variant="body2" color="text.secondary">
            {props.user.profile_description}
        </Typography>
      </CardContent>
    </Card>
  );
}