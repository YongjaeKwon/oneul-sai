import { SERVICE_NAMES } from '@oneul-sai/constants';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns ok status with service name and timestamp', () => {
    const controller = new HealthController();

    const result = controller.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe(SERVICE_NAMES.apiGateway);
    expect(Number.isNaN(new Date(result.timestamp).getTime())).toBe(false);
  });
});
