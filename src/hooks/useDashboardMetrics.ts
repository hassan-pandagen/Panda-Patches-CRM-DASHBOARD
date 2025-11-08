import { useMemo } from 'react';
import { Order, OrderStatus } from '../types';

export const useDashboardMetrics = (orders: Order[]) => {
  return useMemo(() => {
    let totalRevenue = 0;
    let totalCollected = 0;
    let pendingAmount = 0;
    let urgentOrders = 0;
    let inProductionOrders = 0;

    orders.forEach((o) => {
      const amount = Number(o.orderAmount) || 0;
      const paid = Number(o.amountPaid) || 0;

      totalRevenue += amount;
      totalCollected += paid;
      pendingAmount += amount - paid;

      if (o.is_urgent) urgentOrders += 1;
      if (o.status === OrderStatus.IN_PRODUCTION) inProductionOrders += 1;
    });

    return {
      totalRevenue,
      totalCollected,
      pendingAmount,
      totalOrders: orders.length,
      urgentOrders,
      inProductionOrders,
    };
  }, [orders]);
};
