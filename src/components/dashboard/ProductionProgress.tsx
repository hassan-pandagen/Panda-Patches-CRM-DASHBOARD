// src/components/dashboard/ProductionProgress.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { Order, OrderStatus } from '../../types';

interface Stage {
  status: OrderStatus;
  label: string;
  color: string;
  count: number;
}

interface ProductionProgressProps {
  orders: Order[];
}

const ProductionProgress: React.FC<ProductionProgressProps> = ({ orders }) => {
  // Your logic for defining and calculating stages is 100% correct.
  const stages: Omit<Stage, 'count'>[] = [
    { status: OrderStatus.PENDING, label: 'Pending', color: 'bg-yellow-500' },
    { status: OrderStatus.IN_PRODUCTION, label: 'In Production', color: 'bg-blue-500' },
    { status: OrderStatus.AWAITING_CUSTOMER_APPROVAL, label: 'Review', color: 'bg-purple-500' },
    { status: OrderStatus.COMPLETED, label: 'Completed', color: 'bg-teal-500' },
    { status: OrderStatus.SHIPPED, label: 'Shipped', color: 'bg-green-500' }
  ];

  const stageCounts: Stage[] = stages.map(stage => ({
    ...stage,
    count: orders.filter(order => order.status === stage.status).length
  }));

  const totalInPipeline = stageCounts.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Production Pipeline</h3>
      <div className="space-y-4">
        {stageCounts.map(stage => {
          // --- THE FINAL, SYNTACTICAL FIX IS HERE ---
          // Because we use curly braces `{}`, we must add an explicit `return`.
          const percentage = totalInPipeline > 0 ? (stage.count / totalInPipeline) * 100 : 0;
          
          return (
            <Link to={`/orders?status=${stage.status}`} key={stage.status} className="block group transition-transform hover:scale-[1.01] p-2 -m-2 rounded-lg hover:bg-slate-700/30">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${stage.color}`} />
                  <span className="text-sm font-medium text-slate-300 group-hover:text-white">
                    {stage.label}
                  </span>
                </div>
                <span className="text-sm font-bold text-white">
                  {stage.count}
                </span>
              </div>
              <div className="mt-2 pl-6">
                <div className="bg-slate-700/50 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${stage.color}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            </Link>
          );
          // --- END FIX ---
        })}
      </div>
    </div>
  );
};

export default ProductionProgress;