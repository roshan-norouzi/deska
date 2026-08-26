import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
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
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
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
