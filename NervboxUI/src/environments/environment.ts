import { version } from '../version';

export const environment = {
  ...version,
  production: false,
  apiUrl: 'http://localhost:8080/api',
  signalrSshUrl: 'http://localhost:8080/ws/sshHub',
  signalrSoundUrl: 'http://localhost:8080/ws/soundHub',
  signalrCamUrl: 'http://localhost:8080/ws/camHub',
  signalrChatUrl: 'http://localhost:8080/ws/chatHub',
};
