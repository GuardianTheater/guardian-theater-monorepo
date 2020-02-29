import { Test, TestingModule } from '@nestjs/testing';
import { BungieService } from './bungie.service';

describe('BungieService', () => {
  let service: BungieService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BungieService],
    }).compile();

    service = module.get<BungieService>(BungieService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
