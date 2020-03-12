import { Module, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { SharedServicesModule } from '@services/shared-services';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [SharedServicesModule, ScheduleModule.forRoot()],
  providers: [AppService, Logger],
})
export class AppModule {}
