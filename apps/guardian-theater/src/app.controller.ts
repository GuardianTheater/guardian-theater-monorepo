import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';
import { BungieMembershipType } from 'bungie-api-ts/user';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('data/:membershipId')
  getStoredData(@Param('membershipId') membershipId: string) {
    return this.appService.getInfoAboutMembershipId(membershipId);
  }

  @Get('encounteredClips/:membershipType/:membershipId')
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
