import { prop, getModelForClass } from '@typegoose/typegoose';
import { t } from 'elysia';

// This class defines the public and private key of a L2 address belonging to an OAuthUser

export const UserKeysSchema = t.Object({
    oauth_user_id: t.String(), // The ID of the OAuthUser object that this UserKeys object belongs to
    l2_address_mneumonic: t.String(), // The mneumonic of the L2 address
    l2_address_public_key: t.Optional(t.String()) // The public key of the L2 address
});

export type UserKeysType = typeof UserKeysSchema.static;

export class UserKeys {
    @prop({ required: true, index: true })
    public oauth_user_id!: string; // The ID of the OAuthUser object that this UserKeys object belongs to

    @prop({ required: true })
    public l2_address_mneumonic!: string; // The mneumonic of the L2 address

    @prop({ required: false })
    public l2_address_public_key!: string; // The public key of the L2 address
}

export const UserKeysModel = getModelForClass(UserKeys);
