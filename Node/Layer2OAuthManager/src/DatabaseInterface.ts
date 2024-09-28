export const db_name: string = "my_db";

import { type MongoDbConfig } from 'models/config_models/Config';
import {OAuthUserModel, type OAuthUser} from 'models/db_models/OAuthUser';
import {UserKeysModel, type UserKeys} from 'models/db_models/UserKeys';
import {GenerateMneumonic} from 'utils/mneumonic';
import { type Layer2OAuthToken } from 'models/http_server_models/AuthorizeWithLayer2AuthTokenRequest';

export interface UserInfo {
    [key: string]: any;
}

import mongoose from 'mongoose';


//Create a DatabaseInterface class that connect to a db with the params given through MongoDbConfig, and would save and read OAuthUser objects
export class DatabaseInterface {
    private config: MongoDbConfig;

    constructor(config: MongoDbConfig) {
        this.config = config;
    }

    async connect(): Promise<boolean> {
        let connected: boolean = false;
        await mongoose.connect('mongodb://' + this.config.host + ':' + this.config.port + '/' + this.config.dbName)
        .then(() => {
            console.log('Connected to MongoDB');
            connected = true;
            }
        )
        .catch(err => {
            console.error('Error connecting to MongoDB:', err);
            connected = false;   
            }
        );
        return connected;
    }

    async saveOAuthUser(user: OAuthUser, updateIfExists: boolean = false): Promise<void> {
        user.buildPrimaryKey();
        const newUser = new OAuthUserModel(user);
        try {
            if (updateIfExists) {
                await OAuthUserModel.findOneAndUpdate(
                    { _id: user._id },
                    user,
                    { upsert: true, new: true }
                ).then(() => console.log('OAuthUser updated successfully'));
            } else {
                await newUser.save().then(() => console.log('OAuthUser saved successfully'));
            }
        } catch (error) {
            console.error('Error saving OAuthUser:', error);
        }   
    }

    async getOAuthUser(service_name: string, service_specific_id: string): Promise<OAuthUser | null> {
        return await OAuthUserModel.findOne({ service_name, service_specific_id });
    }

    // Find the user keys whose oauth_user_id matches the given userId
    async getOAuthUserKeys(userId: string): Promise<UserKeys | null> {
        try {
            const userKeys = await UserKeysModel.findOne({ oauth_user_id: userId });
            if (userKeys) {
                return userKeys;
            } 
            else {
                console.log('No UserKeys found for the given userId');
                return null;
            }
        } catch (error) {
            console.log('Error fetching UserKeys:', error);
            return null;
        }
    }

    async authorizeOAuthUserWithLayer2Token(layer2Token: Layer2OAuthToken): Promise<[OAuthUser | null, UserKeys | null]> {
        const user = await OAuthUserModel.findOne({ layer2_authorization_token: layer2Token.layer2_authorization_token });
        if(!user) {
            return [null, null];
        }
        const keys = await this.getOAuthUserKeys(user._id);
        return [user, keys];
    }

    // Create a new UserKeys object with the given userId and insert it into the UserKeys collection.
    // It only creates a UserKeys object, it does not update an existing UserKeys object.
    // userId is the primary key (_id) of the OAuthUser object
    async createNewUserKeys(userId: string): Promise<UserKeys> {
        const userKeys = new UserKeysModel();
        userKeys.oauth_user_id = userId;
        userKeys.l2_address_mneumonic = GenerateMneumonic();

        try{
            const existingUserKeys = await UserKeysModel.findOne({ oauth_user_id: userId });
            if (!existingUserKeys) {
                await userKeys.save().then(() => console.log('UserKeys created successfully'));
            } else {
                console.log('UserKeys with the given oauth_user_id already exists');
            }
        } catch (error) {
            console.error('Error creating UserKeys:', error);
        }
        
        return userKeys;
    }
}

