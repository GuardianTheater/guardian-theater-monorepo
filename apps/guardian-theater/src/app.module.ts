import { Module, Logger, CacheModule } from '@nestjs/common';
import { AppService } from './app.service';
import { SharedServicesModule } from '@services/shared-services';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [SharedServicesModule, CacheModule.register(), AuthModule],
  controllers: [AppController],
  providers: [AppService, Logger],
})
export class AppModule {}
