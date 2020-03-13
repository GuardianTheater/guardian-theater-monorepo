import { Module, HttpModule } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BungieStrategy } from './bungie.strategy';
import { JwtStrategy } from './jwt.strategy';
import { SharedServicesModule } from '@services/shared-services';

@Module({
  imports: [SharedServicesModule, HttpModule],
  controllers: [AuthController],
  providers: [AuthService, BungieStrategy, JwtStrategy],
})
export class AuthModule {}
