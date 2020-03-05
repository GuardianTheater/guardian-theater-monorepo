import { Injectable, HttpService } from '@nestjs/common';
import { XboxGameClipsResponse } from './xbox.types';
import { AxiosResponse } from 'axios';

@Injectable()
export class XboxService {
  titleIdConsole = 144389848;
  titleIdPc = 1762047744;

  constructor(private readonly httpService: HttpService) {}

  async fetchConsoleDestiny2ClipsForGamertag(
    gamertag?: string,
  ): Promise<AxiosResponse<XboxGameClipsResponse>> {
    const uri = `https://api.xboxrecord.us/gameclips/gamertag/${gamertag}/titleid/${this.titleIdConsole}`;
    return this.httpService.get(uri).toPromise();
  }
}
