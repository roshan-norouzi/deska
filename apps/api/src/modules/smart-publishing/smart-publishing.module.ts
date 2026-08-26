import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GapGptClient } from './gapgpt.client';
import { NewsroomService } from './newsroom.service';
import { PublishingSettingsService } from './publishing-settings.service';
import { SecretProtectionService } from './secret-protection.service';
import { SmartPublishingController } from './smart-publishing.controller';
import { SmartPublishingService } from './smart-publishing.service';
import { SourceReaderService } from './source-reader.service';
import { WordPressClient } from './wordpress.client';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SmartPublishingController],
  providers: [SmartPublishingService, PublishingSettingsService, SecretProtectionService, GapGptClient, WordPressClient, SourceReaderService, NewsroomService],
})
export class SmartPublishingModule {}
