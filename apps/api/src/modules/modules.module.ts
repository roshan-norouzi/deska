import { Module } from '@nestjs/common';
import { ContactsModule } from './contacts/contacts.module';
import { DocumentsModule } from './documents/documents.module';
import { CalendarModule } from './calendar/calendar.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProjectsModule } from './projects/projects.module';
import { SmartPublishingModule } from './smart-publishing/smart-publishing.module';

@Module({
  imports: [
    ContactsModule,
    DocumentsModule,
    CalendarModule,
    DashboardModule,
    ProjectsModule,
    SmartPublishingModule,
  ],
  exports: [
    ContactsModule,
    DocumentsModule,
    CalendarModule,
    DashboardModule,
    ProjectsModule,
    SmartPublishingModule,
  ],
})
export class BusinessModulesModule {}
