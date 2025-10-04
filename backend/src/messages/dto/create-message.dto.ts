import { IsString, MinLength, MaxLength, IsInt } from 'class-validator';

// senderId se eliminará del payload externo: se obtiene del JWT
export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @IsInt()
  channelId!: number;
}
