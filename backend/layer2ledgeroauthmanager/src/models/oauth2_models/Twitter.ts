export interface TwitterUserInfoPublicMetrics{
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
}
export interface TwitterUserInfoData{
    data: TwitterUserInfo;
}
export interface TwitterUserInfo{
    id: string;
    name: string;
    username: string;
    created_at: string;
    description: string;
    entities: any;
    location: string;
    most_recent_tweet_id: string;
    profile_banner_url: string;
    profile_image_url: string;
    protected: boolean;
    public_metrics: TwitterUserInfoPublicMetrics;
    receives_your_dm: boolean;
    subscription_type: string;
    url: string;
    verified: boolean;
    verified_type: string;
    withheld: any;
}