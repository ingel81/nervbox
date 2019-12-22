import { version } from '../version';

export const environment = {
  ...version,
  production: true,
  apiUrl: '/api',
  signalrSshUrl: '/ws/sshHub',
  signalrSoundUrl: '/ws/soundHub',
  signalrCamUrl: '/ws/camHub',
  signalrChatUrl: '/ws/chatHub',
};
