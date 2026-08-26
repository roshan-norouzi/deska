import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const PUBLISHING_SETTING_KEYS = [
  'gapgpt_base_url',
  'gapgpt_api_key',
  'gapgpt_model',
  'news_summary_prompt',
  'news_full_translation_prompt',
  'news_poll_interval_minutes',
  'news_max_age_days',
  'wp_site_url',
  'wp_username',
  'wp_app_password',
  'wp_post_status',
  'wp_category_id',
  'telegram_bot_token',
  'telegram_chat_id',
] as const;

export type PublishingSettingKey = (typeof PUBLISHING_SETTING_KEYS)[number];
export type PublishingSettings = Partial<Record<PublishingSettingKey, string>>;

export class UpdatePublishingSettingsDto {
  @IsOptional() @IsString() @MaxLength(500) gapgpt_base_url?: string;
  @IsOptional() @IsString() @MaxLength(500) gapgpt_api_key?: string;
  @IsOptional() @IsString() @MaxLength(120) gapgpt_model?: string;
  @IsOptional() @IsString() @MaxLength(12000) news_summary_prompt?: string;
  @IsOptional() @IsString() @MaxLength(12000) news_full_translation_prompt?: string;
  @IsOptional() @IsString() @MaxLength(10) news_poll_interval_minutes?: string;
  @IsOptional() @IsString() @MaxLength(10) news_max_age_days?: string;
  @IsOptional() @IsString() @MaxLength(500) wp_site_url?: string;
  @IsOptional() @IsString() @MaxLength(200) wp_username?: string;
  @IsOptional() @IsString() @MaxLength(500) wp_app_password?: string;
  @IsOptional() @IsIn(['publish', 'draft', 'pending']) wp_post_status?: string;
  @IsOptional() @IsString() @MaxLength(20) wp_category_id?: string;
  @IsOptional() @IsString() @MaxLength(500) telegram_bot_token?: string;
  @IsOptional() @IsString() @MaxLength(200) telegram_chat_id?: string;
}

export class TestPublishingConnectionDto extends UpdatePublishingSettingsDto {}

