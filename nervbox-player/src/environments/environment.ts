import { secrets } from './secrets';

export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080/api',
  wsUrl: 'http://localhost:8080/ws',
  cesiumAccessToken: secrets.cesiumAccessToken,
};
