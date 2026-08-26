import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: 'نام نقش باید متن باشد' })
  @MaxLength(50, { message: 'نام نقش نباید بیش از ۵۰ کاراکتر باشد' })
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
