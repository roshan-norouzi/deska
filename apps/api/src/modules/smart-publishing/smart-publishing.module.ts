import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SecretProtectionService } from './secret-protection.service';
import { PublishingFontFileController, PublishingImageFileController, SmartPublishingController, SocialPublishingMediaController } from './smart-publishing.controller';
import { SmartPublishingService } from './smart-publishing.service';
import { SourceReaderService } from './source-reader.service';
import { SocialStudioService } from './social-studio.service';
import { WordPressClient } from './wordpress.client';
import { SocialNetworkPublisherService } from './social-network-publisher.service';
import { DailyReportService } from './daily-report.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SmartPublishingController, PublishingFontFileController, PublishingImageFileController, SocialPublishingMediaController],
  providers: [SmartPublishingService, PublishingSettingsService, SecretProtectionService, GapGptClient, WordPressClient, SourceReaderService, NewsroomService, SocialStudioService, SocialNetworkPublisherService, DailyReportService],
})
export class SmartPublishingModule {}
