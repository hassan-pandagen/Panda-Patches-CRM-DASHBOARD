import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

const NotFoundPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="p-8 bg-slate-800/30 border border-slate-700/50 rounded-2xl shadow-xl max-w-md">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-4xl font-bold text-white">404 - Not Found</h1>
        <p className="mt-4 text-slate-400">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/" className="mt-8 inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium transition-colors">
          Go Back to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;