import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order, OrderStatus } from '../../types';
import { Zap, AlertCircle, CheckCircle, ChevronRight, Clock } from 'lucide-react';
import { motion, Variants } from 'framer-motion';

interface ProductionStatus {
  name: string;
  count: number;
  icon: React.FC<{ className?: string }>;
  color: string;
  filterQuery: string;
}

interface ProductionProgressProps {
  orders: Order[];
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 100 } },
};

export const ProductionProgress: React.FC<ProductionProgressProps> = ({ orders }) => {
  const navigate = useNavigate();

  const { statusCounts, urgentCount } = useMemo(() => {
    const counts = orders.reduce((acc, order) => {
      const status = order.status || 'Unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const urgent = orders.filter(o => o.isUrgent).length;

    return { statusCounts: counts, urgentCount: urgent };
  }, [orders]);

  // FIXED: Explicit string values for filters to ensure URL matches AllOrdersPage logic
  const productionStatuses: ProductionStatus[] = [
    { 
      name: 'Urgent Orders', 
      count: urgentCount, 
      icon: Zap, 
      color: 'text-red-400', 
      filterQuery: 'filter=URGENT' 
    },
    { 
      name: 'Awaiting Approval', 
      count: statusCounts['AWAITING_CUSTOMER_APPROVAL'] || 0, 
      icon: Clock, 
      color: 'text-purple-400', 
      filterQuery: 'filter=AWAITING_CUSTOMER_APPROVAL' 
    },
    { 
      name: 'In Production', 
      count: statusCounts['IN_PRODUCTION'] || 0, 
      icon: Zap, 
      color: 'text-blue-400', 
      filterQuery: 'filter=IN_PRODUCTION' 
    },
    { 
      name: 'Needs Revision', 
      count: statusCounts['REVISION_REQUESTED'] || 0, 
      icon: AlertCircle, 
      color: 'text-yellow-400', 
      filterQuery: 'filter=REVISION_REQUESTED' 
    },
    { 
      name: 'Completed', 
      count: statusCounts['COMPLETED'] || 0, 
      icon: CheckCircle, 
      color: 'text-green-400', 
      filterQuery: 'filter=COMPLETED' 
    },
  ];

  const handleStatusClick = (filterQuery: string) => {
    navigate(`/orders?${filterQuery}`);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Production Pipeline</h3>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        {productionStatuses.map((item) => (
          <motion.button
            key={item.name}
            variants={itemVariants}
            onClick={() => handleStatusClick(item.filterQuery)}
            className="w-full text-left p-4 bg-slate-800/50 rounded-lg border border-transparent hover:border-slate-600 hover:bg-slate-800 transition-all duration-200 group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <span className="font-medium text-slate-200">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-white text-lg">{item.count}</span>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors" />
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
};

export default ProductionProgress;