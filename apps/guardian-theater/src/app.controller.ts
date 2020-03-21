import {
  Controller,
  Get,
  Param,
  UseInterceptors,
  CacheInterceptor,
  CacheTTL,
  UseGuards,
  Request,
  Post,
  Body,
} from '@nestjs/common';
import { AppService } from './app.service';
import { BungieMembershipType } from 'bungie-api-ts/user';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';

@Controller()
@UseInterceptors(CacheInterceptor)
export class AppController {
  constructor(
    private readonly appService: AppService,
    private jwtService: JwtService,
  ) {}

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

  @Get('linkedAccounts')
  @UseGuards(JwtAuthGuard)
  getLinkedAccounts(@Request() req) {
    const membershipId = req.user.membershipId;
    return this.appService.getAllLinkedAccounts(membershipId);
  }

  @Get('instance/:instanceId')
  @CacheTTL(300)
  getClipsForActivity(@Param('instanceId') instanceId: string) {
    return this.appService.getVideosForInstance(instanceId);
  }

  @Post('removeLink')
  @UseGuards(JwtAuthGuard)
  removeLink(
    @Request() req,
    @Body()
    removeLinkDto: {
      linkId: string;
    },
  ) {
    const membershipId = req.user.membershipId;
    return this.appService.removeLink(removeLinkDto.linkId, membershipId);
  }

  @Post('addLink')
  @UseGuards(JwtAuthGuard)
  async addLink(
    @Request() req,
    @Body()
    addLinkDto: {
      jwt: string;
    },
  ) {
    try {
      const token = this.jwtService.verify(addLinkDto.jwt);
      if (token.provider === 'twitch') {
        const membershipId = req.user.membershipId;
        const twitchId = token.userId;

        const link = await this.appService.addTwitchLink(
          membershipId,
          twitchId,
        );
        return link;
      }
    } catch (e) {
      return {};
    }
  }
}
