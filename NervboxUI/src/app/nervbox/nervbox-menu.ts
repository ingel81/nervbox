import { NbMenuItem } from '@nebular/theme';

export class NbMenuItemWithPermission extends NbMenuItem {
  permissionKey: string;
}

export const MENU_ITEMS: NbMenuItemWithPermission[] = [
  {
    title: 'Dashboard',
    icon: 'home',
    link: '/nervbox/dashboard',
    home: true,
    hidden: false,
    permissionKey: "dashboard",
    pathMatch: "nervbox/dashboard"
  },
  {
    title: 'Einstellungen',
    icon: 'settings',
    link: '/nervbox/settings/network',
    home: false,
    hidden: true,
    permissionKey: "settings",
    pathMatch: "nervbox/settings"
  },
  {
    title: 'Logs',
    icon: 'file-text',
    link: '/nervbox/logs/system',
    home: false,
    hidden: true,
    permissionKey: "logs",
    pathMatch: "nervbox/logs"
  },
  {
    title: 'Debug',
    icon: 'hash',
    link: '/nervbox/debug/ssh',
    home: false,
    hidden: true,
    permissionKey: "debug",
    pathMatch: "nervbox/debug"
  },
];
