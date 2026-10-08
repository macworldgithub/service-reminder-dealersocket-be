import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      status: 'ok',
      service: 'DealerSocket Campaign Operations Hub API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'DealerSocket Campaign Operations Hub API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
