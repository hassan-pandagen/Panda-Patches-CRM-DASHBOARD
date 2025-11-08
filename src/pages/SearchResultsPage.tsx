import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { OrderSummary } from '../types/index';
import { supabase } from '../services/supabaseClient';
import Spinner from '../components/ui/Spinner';
import { getStatusInfo } from '../constants';

const SearchResultsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q');
  const [results, setResults] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Moved searchOrders logic inside the component to ensure it selects the new 'isUrgent' field.
  const searchOrders = async (searchTerm: string): Promise<OrderSummary[]> => {
    const { data, error } = await supabase
      .from('orders')
      .select('orderNumber:order_number, customerName:customer_name, salesAgent:sales_agent, status, orderAmount:order_amount, createdAt:created_at, is_urgent')
      .or(
        `order_number.ilike.%${searchTerm}%,` +
        `customer_name.ilike.%${searchTerm}%,` +
        `customer_email.ilike.%${searchTerm}%,` +
        `customer_phone.ilike.%${searchTerm}%`
      );
  
    if (error) throw error;
  
    return data as OrderSummary[];
  };

  useEffect(() => {
    if (query) {
      setLoading(true);
      setError(null);
      searchOrders(query)
        .then(data => {
          setResults(data);
        })
        .catch(err => {
          setError(`Failed to perform search: ${err.message}`);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h2 className="text-3xl font-bold text-slate-100">
        Search Results for: <span className="text-[#6366F1]">"{query}"</span>
      </h2>

      {loading && <div className="flex justify-center items-center h-64"><Spinner /></div>}
      {error && <div className="text-center py-10 text-red-300">{error}</div>}

      {!loading && !error && (
        <div className="bg-[#1A1B23] border border-[#252836] rounded-2xl shadow-inner overflow-hidden">
          {results.length > 0 ? (
            <table className="min-w-full text-slate-300">
              <thead className="bg-[#252836]/60 text-slate-400 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Order ID</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Sales Agent</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#252836]">
                {results.map(order => (
                  <tr
                    key={order.orderNumber}
                    className={`transition-colors duration-200 ${
                      order.is_urgent
                        ? 'bg-red-900/30 hover:bg-red-900/40'
                        : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[#6366F1]">
                      <Link to={`/order/${order.orderNumber}`}>{`#${order.orderNumber}`}</Link>
                    </td>
                    <td className="px-4 py-3">{order.customerName}</td>
                    <td className="px-4 py-3">{order.salesAgent}</td>
                    <td className={`px-4 py-3 font-semibold ${getStatusInfo(order.status).textColor}`}>{getStatusInfo(order.status).label}</td>
                    <td className="px-4 py-3 text-right">${order.orderAmount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-center text-slate-400 py-16">No orders found matching your search.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchResultsPage;