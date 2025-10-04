import { IsString, MinLength, MaxLength } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;
}
