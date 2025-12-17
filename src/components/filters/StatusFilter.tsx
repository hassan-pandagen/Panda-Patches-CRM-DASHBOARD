import React from 'react';
import { OrderStatus } from '../../types';
import { getStatusInfo } from '../../constants/statusInfo';

interface StatusFilterProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

const StatusFilter: React.FC<StatusFilterProps> = ({ selectedStatus, onStatusChange }) => {
  return (
    <select
      value={selectedStatus}
      onChange={(e) => onStatusChange(e.target.value)}
      className="w-full sm:w-auto bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange appearance-none"
    >
      <option value="ALL">All Statuses</option>
      {Object.values(OrderStatus).map((status) => (
        <option key={status} value={status}>
          {getStatusInfo(status).label}
        </option>
      ))}
    </select>
  );
};

export default StatusFilter;