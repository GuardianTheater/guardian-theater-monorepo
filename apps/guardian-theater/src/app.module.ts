import { Module, Logger } from '@nestjs/common';
import { AppService } from './app.service';
import { SharedServicesModule } from '@services/shared-services';
import { AppController } from './app.controller';

@Module({
  imports: [SharedServicesModule],
  controllers: [AppController],
  providers: [AppService, Logger],
})
export class AppModule {}
