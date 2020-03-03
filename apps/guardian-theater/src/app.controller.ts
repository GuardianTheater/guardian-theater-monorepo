import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get(':membershipId')
  getAllEncounteredVideos(@Param() params) {
    return this.appService.getAllEncounteredVideos(params.membershipId);
  }
}
