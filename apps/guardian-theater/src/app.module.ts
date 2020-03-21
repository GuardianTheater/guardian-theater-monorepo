import { Module, Logger, CacheModule } from '@nestjs/common';
import { AppService } from './app.service';
import { SharedServicesModule } from '@services/shared-services';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    SharedServicesModule,
    CacheModule.register(),
    AuthModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: '3600s' },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, Logger],
})
export class AppModule {}
