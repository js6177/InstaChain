export interface FacebookUserInfo {
    id: string;
    name: string;
    email?: string;
    picture?: {
        data: {
            url: string;
        }
    };
}
