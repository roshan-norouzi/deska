import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EMPLOYEE_STATUS, ORGANIZATIONAL_ROLES } from '@deska/shared';
import { EmployeeProfileFieldsDto } from './employee-profile-fields.dto';

const EDITABLE_TENANT_ROLES = [...ORGANIZATIONAL_ROLES] as const;

export class UpdateMemberDto extends EmployeeProfileFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'نام نمی‌تواند خالی باشد' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsIn(EDITABLE_TENANT_ROLES, { message: 'نقش عضویت معتبر نیست' })
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsString()
  departmentId?: string | null;

  @IsOptional()
  @IsIn(Object.values(EMPLOYEE_STATUS), { message: 'وضعیت کارمند معتبر نیست' })
  status?: string;

  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsDateString({}, { message: 'تاریخ استخدام معتبر نیست' })
  hireDate?: string | null;

}
