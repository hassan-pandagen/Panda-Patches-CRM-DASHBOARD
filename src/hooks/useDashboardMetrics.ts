// src/hooks/useDashboardMetrics.ts - FINAL, ROBUST VERSION 2.0

import { useMemo } from 'react';
import { Order, OrderStatus } from '../types';

export const useDashboardMetrics = (orders: Order[]) => {
  return useMemo(() => {
    // Guard clause for when data is not yet loaded
    if (!orders) {
      return {
        totalRevenue: 0,
        totalCollected: 0,
        totalOrders: 0,
        actionablePendingAmount: 0,
        urgentOrdersCount: 0,
      };
    }
    
    // Use reduce for a cleaner calculation
    const metrics = orders.reduce(
      (acc, order) => {
        const orderAmount = Number(order.orderAmount) || 0;
        const amountPaid = Number(order.amountPaid) || 0;
        const amountRemaining = Number(order.amountRemaining) || 0;
        const isPending = amountRemaining > 0 && ![OrderStatus.CANCELLED, OrderStatus.REFUNDED].includes(order.status as OrderStatus);
        const isUrgentAndActive = order.isUrgent && ![OrderStatus.COMPLETED, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status as OrderStatus);

        acc.totalRevenue += orderAmount;
        acc.totalCollected += amountPaid;

        if (isPending) {
          acc.actionablePendingAmount += amountRemaining;
        }

        if (isUrgentAndActive) {
          acc.urgentOrdersCount += 1;
        }
        
        return acc;
      },
      {
        totalRevenue: 0,
        totalCollected: 0,
        actionablePendingAmount: 0,
        urgentOrdersCount: 0,
      }
    );

    return {
      ...metrics,
      totalOrders: orders.length,
    };
  }, [orders]);
};