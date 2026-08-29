import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ORGANIZATIONAL_ROLES } from '@deska/shared';
import { EmployeeProfileFieldsDto } from './employee-profile-fields.dto';

export class InviteMemberDto extends EmployeeProfileFieldsDto {
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @IsNotEmpty({ message: 'ایمیل الزامی است' })
  email!: string;

  @IsIn([...ORGANIZATIONAL_ROLES], { message: 'نقش عضویت معتبر نیست' })
  role!: string;

  @IsOptional()
  @IsString()
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام نمی‌تواند خالی باشد' })
  name?: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  hireDate?: string;

}
