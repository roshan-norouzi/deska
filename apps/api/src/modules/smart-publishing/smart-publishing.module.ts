import { Module } from '@nestjs/common';
import { SmartPublishingController } from './smart-publishing.controller';
import { SmartPublishingService } from './smart-publishing.service';
@Module({ controllers: [SmartPublishingController], providers: [SmartPublishingService] })
export class SmartPublishingModule {}
