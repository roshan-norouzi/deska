import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @IsString({ message: 'توکن بازنشانی باید متن باشد' })
  @IsNotEmpty({ message: 'توکن بازنشانی الزامی است' })
  refreshToken!: string;
}
