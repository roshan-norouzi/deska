import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { EmployeeController } from './employee.controller';
import { EmployeeService } from './employee.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantController, EmployeeController],
  providers: [TenantService, EmployeeService],
  exports: [TenantService, EmployeeService],
})
export class TenantModule {}
