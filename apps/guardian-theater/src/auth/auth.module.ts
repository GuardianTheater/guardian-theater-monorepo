import { Module, HttpModule } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BungieStrategy } from './bungie.strategy';
import { JwtStrategy } from './jwt.strategy';
import { SharedServicesModule } from '@services/shared-services';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    SharedServicesModule,
    HttpModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET_KEY,
      signOptions: { expiresIn: '3600s' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, BungieStrategy, JwtStrategy],
})
export class AuthModule {}
