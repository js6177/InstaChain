import { prop, pre, getModelForClass } from '@typegoose/typegoose';
import mongoose from 'mongoose';

// This class defines the structure of the OAuthUser object that will be saved in the database
// An OAuthUser object is created when a user logs in with OAuth2 protocol to a social media service (i.e. Twitter, Github, etc.)

export class OAuthUser {
    @prop({ required: true })
    public service_name!: string; // The name of the service a user is logged/signed in with (i.e. twitter, github, etc.)
  
    @prop({ required: true })
    public service_specific_id!: string; // Their ID in the service (i.e. Twitter ID, Github ID, etc.)

    @prop({ required: true })
    public _id!: string; // The primary key of the object, which is a combination of the service_name and service_specific_id
  
    @prop({ required: true })
    public layer2_authorization_token!: string; // The token that is saved in the client's browser
  
    @prop({ required: true })
    public layer2_authorization_token_expiration_timestamp!: number; // The expiration timestamp of the token in epoch time
  
    @prop({ required: true })
    public username!: string;

    @prop()
    public name!: string;

    @prop()
    public profile_pic_url!: string;

    @prop()
    public profile_url!: string;

    @prop()
    public first_login_date!: Date; // Date when the user first signed up with OAuth2 to Layer2

    @prop()
    public last_login_date?: Date;

    buildPrimaryKey(): void {
        this._id = this.service_name + '-' + this.service_specific_id;
    }

    hasSignedInBefore(): boolean {
        return this.first_login_date !== null;
    }

}
  
export const OAuthUserModel = getModelForClass(OAuthUser);