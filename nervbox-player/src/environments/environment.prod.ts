import { secrets } from './secrets';

export const environment = {
  production: true,
  apiUrl: '/api',
  wsUrl: '/ws',
  cesiumAccessToken: secrets.cesiumAccessToken,
};
