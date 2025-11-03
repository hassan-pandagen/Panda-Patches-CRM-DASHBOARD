import React from 'react';

interface AgentDetailModalProps {
  agent: string;
  onClose: () => void;
}

const AgentDetailModal: React.FC<AgentDetailModalProps> = ({ agent, onClose }) => {
  // In a real implementation, you would use useQuery here to fetch
  // detailed stats for the selected agent within the current date range.
  // For example:
  // const { data, isLoading } = useQuery(['agentDetails', agent, dateRange], () => fetchAgentDetails(agent, dateRange));

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative mx-auto max-w-2xl w-full bg-slate-900/80 border border-slate-700/50 rounded-2xl shadow-[0_0_40px_rgba(236,72,153,0.15)] p-6"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-gray-100">Agent Details: {agent}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        <div>
          <p className="text-gray-300">
            Detailed statistics for this agent will be displayed here.
            This can include total orders, average order value, and a list of their recent orders within the selected date range.
          </p>
          {/* Placeholder for charts or more detailed stats */}
        </div>
      </div>
    </div>
  );
};

export default AgentDetailModal;