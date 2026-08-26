import { Module } from '@nestjs/common';
import { ContactsModule } from './contacts/contacts.module';
import { DocumentsModule } from './documents/documents.module';
import { CalendarModule } from './calendar/calendar.module';
import { HrModule } from './hr/hr.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ContactsModule,
    DocumentsModule,
    CalendarModule,
    HrModule,
    DashboardModule,
  ],
  exports: [
    ContactsModule,
    DocumentsModule,
    CalendarModule,
    HrModule,
    DashboardModule,
  ],
})
export class BusinessModulesModule {}
