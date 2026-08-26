import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString({ message: 'نام نقش باید متن باشد' })
  @IsNotEmpty({ message: 'نام نقش الزامی است' })
  @MaxLength(50, { message: 'نام نقش نباید بیش از ۵۰ کاراکتر باشد' })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
