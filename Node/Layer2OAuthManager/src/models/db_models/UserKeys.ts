import { prop, pre, getModelForClass } from '@typegoose/typegoose';
import mongoose from 'mongoose';

// This class defines the public and private key of a L2 address belonging to an OAuthUser

export class UserKeys {
    @prop({ required: true, index: true })
    public oauth_user_id!: string; // The ID of the OAuthUser object that this UserKeys object belongs to

    @prop({ required: true })
    public l2_address_mneumonic!: string; // The mneumonic of the L2 address
}

export const UserKeysModel = getModelForClass(UserKeys);