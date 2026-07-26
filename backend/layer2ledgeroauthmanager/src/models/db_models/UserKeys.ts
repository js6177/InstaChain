import { getModelForClass, prop } from "@typegoose/typegoose";

// This class defines the public and private key of a L2 address belonging to an OAuthUser

export class UserKeys {
	@prop({ required: true, index: true })
	public oauth_user_id!: string; // The ID of the OAuthUser object that this UserKeys object belongs to

	@prop({ required: true })
	public l2_address_mneumonic!: string; // The mneumonic of the L2 address

	@prop({ required: false })
	public l2_address_public_key!: string; // The public key of the L2 address
}

export const UserKeysModel = getModelForClass(UserKeys);
