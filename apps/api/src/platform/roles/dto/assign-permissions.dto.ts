import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AssignPermissionsDto {
  @IsArray({ message: 'دسترسی‌ها باید آرایه باشد' })
  @ArrayNotEmpty({ message: 'حداقل یک دسترسی الزامی است' })
  @IsString({ each: true, message: 'هر دسترسی باید متن باشد' })
  permissions!: string[];
}
