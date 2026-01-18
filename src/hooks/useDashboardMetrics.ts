// src/hooks/useDashboardMetrics.ts - FINAL, ROBUST VERSION 2.0

import React, { useMemo } from 'react';
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
        // Calculate remaining instead of relying on potentially stale amountRemaining
        const amountRemaining = Math.max(0, orderAmount - amountPaid);
        // Pending Payment = not fully paid AND not cancelled/refunded
        const isPending = amountRemaining > 0.01 &&
          order.status !== OrderStatus.CANCELLED &&
          order.status !== OrderStatus.REFUNDED;
        const isUrgentAndActive = order.isUrgent && ![OrderStatus.COMPLETED, OrderStatus.SHIPPED, OrderStatus.DELIVERED].includes(order.status as OrderStatus);

        // Count revenue from all orders except cancelled
        // For refunded orders, use originalAmount (what customer paid before refund)
        // This shows true revenue impact including costs already paid
        if (order.status !== OrderStatus.CANCELLED) {
          const revenue = order.status === OrderStatus.REFUNDED
            ? ((order as any).originalAmount || orderAmount)
            : orderAmount;
          acc.totalRevenue += revenue;
          acc.totalCollected += amountPaid;
        }

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