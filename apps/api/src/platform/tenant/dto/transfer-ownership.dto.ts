import { IsNotEmpty, IsString } from 'class-validator';

export class TransferOwnershipDto {
  @IsString()
  @IsNotEmpty({ message: 'کاربر مقصد الزامی است' })
  targetUserId!: string;
}
