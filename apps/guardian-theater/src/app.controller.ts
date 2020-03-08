import {
  Controller,
  Get,
  Param,
  UseInterceptors,
  CacheInterceptor,
  CacheTTL,
} from '@nestjs/common';
import { AppService } from './app.service';
import { BungieMembershipType } from 'bungie-api-ts/user';

@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('data/:membershipId')
  @CacheTTL(30)
  getStoredData(@Param('membershipId') membershipId: string) {
    return this.appService.getInfoAboutMembershipId(membershipId);
  }

  @Get('streamervsstreamer')
  @CacheTTL(30)
  getStreamerVsStreamer() {
    return this.appService.getStreamerVsStreamerInstances();
  }

  @Get('encounteredClips/:membershipType/:membershipId')
  @CacheTTL(30)
  getAllEncounteredVideos(
    @Param('membershipType') membershipType: BungieMembershipType,
    @Param('membershipId') membershipId: string,
  ) {
    return this.appService.getAllEncounteredVideos(
      membershipType,
      membershipId,
    );
  }
}
