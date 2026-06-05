import { useWalletStore } from "@wallet/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function OAuthUserCard({ user }: { user?: any }) {
    const { oauthUser } = useWalletStore();
    const displayUser = user || oauthUser;

    if (!displayUser) return null;

    return (
        <Card className="border-2 shadow-sm mt-4 w-full">
            <CardContent className="pt-6 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                    <AvatarImage src={displayUser.profile_pic_url} alt={displayUser.username} />
                    <AvatarFallback>{displayUser.name?.charAt(0) || displayUser.username?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                    <h3 className="text-xl font-bold tracking-tight">{displayUser.name}</h3>
                    <a href={displayUser.profile_url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                        @{displayUser.username}
                    </a>
                    {displayUser.profile_description && (
                        <p className="text-sm mt-1 text-muted-foreground line-clamp-2">{displayUser.profile_description}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
