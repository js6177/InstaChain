import type * as React from "react";
import { useWalletStore, ROUTES } from "@openl2/wallet-shared";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink } from "lucide-react";
import { OAuthService } from "@openl2/api-layer2oauthmanager";
import {
    SiDiscord,
    SiFacebook,
    SiGithub,
    SiGoogle,
    SiX,
    type IconType,
} from "@icons-pack/react-simple-icons";

const OAUTH_SERVICE_ICONS: Record<OAuthService, IconType> = {
    [OAuthService.Twitter]: SiX,
    [OAuthService.Github]: SiGithub,
    [OAuthService.Google]: SiGoogle,
    [OAuthService.Facebook]: SiFacebook,
    [OAuthService.Discord]: SiDiscord,
};

function isOAuthService(value: string): value is OAuthService {
    return Object.values(OAuthService).includes(value as OAuthService);
}

function OAuthServiceBadge({ service }: { service: OAuthService }): React.JSX.Element {
    const Icon = OAUTH_SERVICE_ICONS[service];

    return (
        <span
            className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-background shadow-sm"
            title={service}
        >
            <Icon size={14} />
        </span>
    );
}

export function OAuthUserCard({ user }: { user?: any }): React.JSX.Element | null {
    const { oauthUser } = useWalletStore();
    const displayUser = user || oauthUser;

    if (!displayUser) return null;

    return (
        <Card className="border-2 shadow-sm mt-4 w-full">
            <CardContent className="pt-6 flex items-center gap-4">
                <div className="relative shrink-0">
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={displayUser.profile_pic_url} alt={displayUser.username} />
                        <AvatarFallback>{displayUser.name?.charAt(0) || displayUser.username?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    {isOAuthService(displayUser.service_name) && (
                        <OAuthServiceBadge service={displayUser.service_name} />
                    )}
                </div>
                <div className="flex flex-col">
                    <h3 className="text-xl font-bold tracking-tight">{displayUser.name}</h3>
                    <div className="flex items-center gap-1 mt-0.5">
                        <Link to={ROUTES.buildExplorerOAuthUser(displayUser.service_name, displayUser.service_specific_id)} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                            @{displayUser.username}
                        </Link>
                        {displayUser.profile_url && (
                            <a href={`https://${displayUser.profile_url}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary transition-colors inline-flex items-center" title="View external profile">
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </div>
                    {displayUser.profile_description && (
                        <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{displayUser.profile_description}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
