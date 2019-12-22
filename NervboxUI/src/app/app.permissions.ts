import { NbAclOptions } from '@nebular/security';

export const RolePermissions: NbAclOptions = {
    accessControl: {
        user_low: {
            view: ['dashboard'],
            do: [],
        },
        user_medium: {
            parent: 'user_low',
            view: ['settings', 'logs'],
            do: [],
        },
        user_high: {
            parent: 'user_medium',
        },
        admin_low: {
            parent: 'user_high',
            view: ['debug'],
            do: ['cam_control'],
        },
        admin_medium: {
            parent: 'admin_low',
            view: [],
        },
        admin_high: {
            parent: 'admin_medium',
            view: ['*'],
            do: ['*'],
        },
    },
};
