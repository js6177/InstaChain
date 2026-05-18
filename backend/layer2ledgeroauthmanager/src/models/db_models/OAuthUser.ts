import { prop, getModelForClass } from '@typegoose/typegoose';
import { v4 as uuidv4 } from 'uuid';
import { t } from 'elysia';


// This class defines the structure of the OAuthUser object that will be saved in the database
// An OAuthUser object is created when a user logs in with OAuth2 protocol to a social media service (i.e. Twitter, Github, etc.)

export const OAuthUserSchema = t.Object({
    service_name: t.String(), // The name of the service a user is logged/signed in with (i.e. twitter, github, etc.)
    service_specific_id: t.String(), // Their ID in the service (i.e. Twitter ID, Github ID, etc.)
    _id: t.String(), // The primary key of the object, which is a combination of the service_name and service_specific_id
    layer2_authorization_token: t.String(), // The token that is saved in the client's browser
    layer2_authorization_token_expiration_timestamp: t.Number(), // The expiration timestamp of the token in epoch time
    username: t.String(),
    name: t.String(),
    profile_pic_url: t.String(),
    profile_url: t.String(),
    profile_description: t.Nullable(t.String()), // Can be the bio/description of the user in the social media service
    first_login_date: t.Date(), // Date when the user first signed up with OAuth2 to Layer2
    last_login_date: t.Optional(t.Date())
});

export type OAuthUserType = typeof OAuthUserSchema.static;

export class OAuthUser {
    @prop()
    public service_name!: string; // The name of the service a user is logged/signed in with (i.e. twitter, github, etc.)
  
    @prop()
    public service_specific_id!: string; // Their ID in the service (i.e. Twitter ID, Github ID, etc.)

    @prop({ required: true })
    public _id!: string; // The primary key of the object, which is a combination of the service_name and service_specific_id
  
    @prop()
    public layer2_authorization_token!: string; // The token that is saved in the client's browser
  
    @prop()
    public layer2_authorization_token_expiration_timestamp!: number; // The expiration timestamp of the token in epoch time
  
    @prop()
    public username!: string;

    @prop()
    public name!: string;

    @prop()
    public profile_pic_url!: string;

    @prop()
    public profile_url!: string;

    @prop()
    public profile_description!: string | null; // Can be the bio/description of the user in the social media service

    @prop()
    public first_login_date!: Date; // Date when the user first signed up with OAuth2 to Layer2

    @prop()
    public last_login_date?: Date;

    buildPrimaryKey(randomUuid: boolean = false): void {
        if(randomUuid) {
            this._id = uuidv4();
        }else{
            this._id = this.service_name + '-' + this.service_specific_id;
        }
    }

    hasSignedInBefore(): boolean {
        return !(this.first_login_date === null || this.first_login_date === undefined);
    }

}
  
export const OAuthUserModel = getModelForClass(OAuthUser);
