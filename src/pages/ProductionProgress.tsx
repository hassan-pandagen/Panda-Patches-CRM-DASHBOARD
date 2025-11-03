import React from 'react';
import { Order } from '../types';

const ProductionProgress = ({ orders }: { orders: Order[] }) => {
  const stages = [
    { status: 'PENDING', label: 'Pending', color: '#F59E0B' },
    { status: 'IN_PRODUCTION', label: 'In Production', color: '#3B82F6' },
    { status: 'AWAITING_CUSTOMER_APPROVAL', label: 'Review', color: '#8B5CF6' },
    { status: 'COMPLETED', label: 'Completed', color: '#10B981' },
    { status: 'SHIPPED', label: 'Shipped', color: '#059669' }
  ];

  const stageCounts = stages.map(stage => ({
    ...stage,
    count: orders.filter(order => order.status === stage.status).length
  }));

  const totalOrders = orders.length;

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Production Pipeline</h3>
      <div className="space-y-4">
        {stageCounts.map((stage) => (
          <div key={stage.status} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-slate-300 text-sm font-medium">{stage.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white font-semibold">{stage.count}</span>
              <div className="w-20 bg-slate-700 rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-500"
                  style={{ 
                    width: totalOrders > 0 ? `${(stage.count / totalOrders) * 100}%` : '0%',
                    backgroundColor: stage.color
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductionProgress;