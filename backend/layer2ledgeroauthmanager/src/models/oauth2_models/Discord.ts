export interface DiscordUserInfo {
    id: string;
    username: string;
    discriminator: string;
    global_name: string | null;
    avatar: string | null;
    email?: string;
}
