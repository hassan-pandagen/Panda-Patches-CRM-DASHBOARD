import React from 'react';
import { OrderStatus } from '../../types';
import { getStatusInfo } from '../../constants';

interface StatusFilterProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

const StatusFilter: React.FC<StatusFilterProps> = ({ selectedStatus, onStatusChange }) => {
  return (
    <select
      value={selectedStatus}
      onChange={(e) => onStatusChange(e.target.value)}
      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm appearance-none"
    >
      <option value="ALL">All Statuses</option>
      {Object.values(OrderStatus).map(status => (
        <option key={status} value={status}>
          {getStatusInfo(status).label}
        </option>
      ))}
    </select>
  );
};

export default StatusFilter;