import { useWalletStore } from "@wallet/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function OAuthUserCard() {
    const { oauthUser } = useWalletStore();

    if (!oauthUser) return null;

    return (
        <Card className="border-2 shadow-sm mt-4 w-full">
            <CardContent className="pt-6 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarImage src={oauthUser.profile_pic_url} alt={oauthUser.username} />
                    <AvatarFallback>{oauthUser.name?.charAt(0) || oauthUser.username?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                    <h3 className="text-xl font-bold tracking-tight">{oauthUser.name}</h3>
                    <a href={oauthUser.profile_url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                        @{oauthUser.username}
                    </a>
                    {oauthUser.profile_description && (
                        <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{oauthUser.profile_description}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
