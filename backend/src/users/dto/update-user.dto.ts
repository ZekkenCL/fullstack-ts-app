import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

// Inherits optional avatarUrl via PartialType
export class UpdateUserDto extends PartialType(CreateUserDto) {}
