import { Module, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { SharedServicesModule } from '@services/shared-services';

@Module({
  imports: [SharedServicesModule],
  providers: [AppService, Logger],
})
export class AppModule {}
