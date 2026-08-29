import { IsDateString, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePublishChannelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endpoint?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class CreatePublishArticleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  channelId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsString()
  @MaxLength(200_000)
  body!: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
