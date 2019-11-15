import { version } from '../version';

export const environment = {
  ...version,
  production: false,
  apiUrl: 'http://localhost:8080/api',
  signalrSerialUrl: 'http://localhost:8080/ws/serialComHub',
  signalrSshUrl: 'http://localhost:8080/ws/sshHub',
  signalrSoundUrl: 'http://localhost:8080/ws/soundHub',
};
