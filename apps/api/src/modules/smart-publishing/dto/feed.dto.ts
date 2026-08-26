import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export const FEED_PURPOSES = ['news-room', 'social-studio', 'daily-report'] as const;
export type FeedPurpose = (typeof FEED_PURPOSES)[number];

export class CreateFeedDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsIn(FEED_PURPOSES)
  purpose!: FeedPurpose;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateFeedDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsIn(FEED_PURPOSES)
  purpose?: FeedPurpose;
}
