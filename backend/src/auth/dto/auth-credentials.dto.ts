import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class AuthCredentialsDto {
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(60)
  @Matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).+$/, {
    message: 'Password must include uppercase, lowercase and number',
  })
  password!: string;
}
