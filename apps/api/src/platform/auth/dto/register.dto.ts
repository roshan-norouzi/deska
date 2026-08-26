import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @IsNotEmpty({ message: 'ایمیل الزامی است' })
  email!: string;

  @IsString({ message: 'رمز عبور باید متن باشد' })
  @IsNotEmpty({ message: 'رمز عبور الزامی است' })
  @MinLength(6, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  password!: string;

  @IsString({ message: 'نام باید متن باشد' })
  @IsNotEmpty({ message: 'نام الزامی است' })
  name!: string;
}
