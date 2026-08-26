import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const EMPLOYEE_STATUSES = ['active', 'inactive', 'terminated'] as const;
const JOB_STATUSES = ['open', 'closed', 'on_hold'] as const;
const APPLICANT_STATUSES = ['new', 'screening', 'interview', 'offer', 'hired', 'rejected'] as const;

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty({ message: 'نام دپارتمان الزامی است' })
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  managerId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  managerId?: string;
}

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty({ message: 'کد پرسنلی الزامی است' })
  @MinLength(1)
  @MaxLength(40)
  @Matches(/^[\p{L}\p{N}._-]+$/u, { message: 'کد پرسنلی فقط شامل حروف، عدد و خط تیره باشد' })
  employeeCode!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES, { message: 'وضعیت کارمند معتبر نیست' })
  status?: string;

}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[\p{L}\p{N}._-]+$/u, { message: 'کد پرسنلی فقط شامل حروف، عدد و خط تیره باشد' })
  employeeCode?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES, { message: 'وضعیت کارمند معتبر نیست' })
  status?: string;

}

export class CreateJobOpeningDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(JOB_STATUSES, { message: 'وضعیت فرصت شغلی معتبر نیست' })
  status?: string;
}

export class UpdateJobOpeningDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(JOB_STATUSES, { message: 'وضعیت فرصت شغلی معتبر نیست' })
  status?: string;
}

export class CreateApplicantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل متقاضی معتبر نیست' })
  email?: string;

  @IsOptional()
  @Matches(/^[0-9۰-۹+()\-\s]{7,20}$/, { message: 'تلفن متقاضی معتبر نیست' })
  phone?: string;

  @IsOptional()
  @IsString()
  resumeUrl?: string;

  @IsOptional()
  @IsIn(APPLICANT_STATUSES, { message: 'وضعیت متقاضی معتبر نیست' })
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateApplicantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'ایمیل متقاضی معتبر نیست' })
  email?: string;

  @IsOptional()
  @Matches(/^[0-9۰-۹+()\-\s]{7,20}$/, { message: 'تلفن متقاضی معتبر نیست' })
  phone?: string;

  @IsOptional()
  @IsIn(APPLICANT_STATUSES, { message: 'وضعیت متقاضی معتبر نیست' })
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

