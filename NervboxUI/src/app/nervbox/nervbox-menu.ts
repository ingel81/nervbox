import { NbMenuItem } from '@nebular/theme';

export const MENU_ITEMS: NbMenuItem[] = [
  {
    title: 'Dashboard',
    icon: 'ion-home',
    link: '/nervbox/dashboard',
    home: true,
  },
  {
    title: 'Logs',
    icon: 'nb-bar-chart',
    link: '/nervbox/logs',
    home: false,
  },  
  {
    title: 'Einstellungen',
    icon: 'ion-settings',
    link: '/nervbox/settings',
    home: false,
  },
  {
    title: 'Debug',
    icon: 'ion-bug',
    link: '/nervbox/debug',
    home: false,
  },  
];
