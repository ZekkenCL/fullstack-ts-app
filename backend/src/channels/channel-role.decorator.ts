import { SetMetadata } from '@nestjs/common';

export const CHANNEL_ROLE_KEY = 'channelRole';
export const ChannelRole = (role: string) => SetMetadata(CHANNEL_ROLE_KEY, role);
