import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ORGANIZATIONAL_ROLES } from '@deska/shared';
import { EmployeeProfileFieldsDto } from './employee-profile-fields.dto';

export class InviteMemberDto extends EmployeeProfileFieldsDto {
  @IsString()
  @MinLength(10, { message: 'شناسه کاربر معتبر نیست' })
  @MaxLength(64)
  userId!: string;

  @IsIn([...ORGANIZATIONAL_ROLES], { message: 'نقش عضویت معتبر نیست' })
  role!: string;

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
