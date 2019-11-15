import { NbAclOptions } from '@nebular/security';

export const RolePermissions: NbAclOptions = {
    accessControl: {
        user_low: {
            view: ['dashboard', 'data'],
            do: ['reset-cleaning-cycle'],
        },
        user_medium: {
            parent: 'user_low',
            view: ['settings', 'logs'],
            do: ['reset-maintenance-cycle', 'reset-metrics', 'edit-warning-limits'],
        },
        user_high: {
            parent: 'user_medium',
        },
        admin_low: {
            parent: 'user_high',
            view: ['debug', 'parametrization', 'hs-calc'],
            do: ['reset-delivery-cycle', 'edit-alert-limits'],
        },
        admin_medium: {
            parent: 'admin_low',
            view: ['commissioning'],
        },
        admin_high: {
            parent: 'admin_medium',
            view: ['*'],
            do: ['*'],
        },
    },
};
