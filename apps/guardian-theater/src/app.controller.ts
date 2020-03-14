import {
  Controller,
  Get,
  Param,
  UseInterceptors,
  CacheInterceptor,
  CacheTTL,
  UseGuards,
} from '@nestjs/common';
import { AppService } from './app.service';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { AuthGuard } from '@nestjs/passport';

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
  @CacheTTL(3600)
  getStreamerVsStreamer() {
    return this.appService.getStreamerVsStreamerInstances();
  }

  @Get('encounteredClips/:membershipType/:membershipId')
  @CacheTTL(300)
  getAllEncounteredVideos(
    @Param('membershipType') membershipType: BungieMembershipType,
    @Param('membershipId') membershipId: string,
  ) {
    return this.appService.getAllEncounteredVideos(
      parseInt((membershipType as unknown) as string, 10),
      membershipId,
    );
  }

  @Get('instance/:instanceId')
  @CacheTTL(300)
  getClipsForActivity(@Param('instanceId') instanceId: string) {
    return this.appService.getVideosForInstance(instanceId);
  }

  @Get('review/:linkId')
  @UseGuards(AuthGuard('jwt'))
  protectedResource() {
    return 'JWT is working!';
  }
}
