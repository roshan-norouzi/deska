import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EMPLOYEE_STATUS, ORGANIZATIONAL_ROLES } from '@deska/shared';
import { EmployeeProfileFieldsDto } from './employee-profile-fields.dto';

const EDITABLE_TENANT_ROLES = [...ORGANIZATIONAL_ROLES] as const;

export class UpdateMemberDto extends EmployeeProfileFieldsDto {
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
