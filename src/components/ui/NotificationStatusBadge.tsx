import React from 'react';
import { OrderStatus } from '../../types';
import { getStatusInfo } from '../../constants/statusInfo';

interface NotificationStatusBadgeProps {
    status: OrderStatus | 'URGENT';
    size?: 'sm' | 'md';
    groupHover?: boolean;
}

const NotificationStatusBadge: React.FC<NotificationStatusBadgeProps> = ({
    status,
    size = 'sm',
    groupHover = false,
}) => {
    // Handle URGENT type separately (not an OrderStatus)
    if (status === 'URGENT') {
        return (
            <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${groupHover
                    ? 'bg-brand-orange/10 text-brand-orange border-brand-orange/20 group-hover:bg-brand-orange/20 group-hover:text-brand-orange group-hover:border-brand-orange/40'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
                </span>
                Urgent
            </div>
        );
    }

    const { label, icon: Icon, color } = getStatusInfo(status as OrderStatus);

    const sizeClasses = {
        sm: 'px-2.5 py-1.5 text-xs',
        md: 'px-3 py-2 text-sm',
    };

    const hoverClasses = groupHover
        ? 'transition-all group-hover:bg-brand-orange/20 group-hover:text-brand-orange group-hover:border-brand-orange/40 group-hover:shadow-[0_0_8px_rgba(251,110,29,0.2)]'
        : '';

    return (
        <div className={`flex items-center gap-2 rounded-full border font-semibold backdrop-blur-sm ${sizeClasses[size]} ${color} ${hoverClasses}`}>
            <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            <span>{label}</span>
        </div>
    );
};

export default NotificationStatusBadge;
