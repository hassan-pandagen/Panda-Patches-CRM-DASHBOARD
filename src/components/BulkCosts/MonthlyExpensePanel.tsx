// src/components/BulkCosts/MonthlyExpensePanel.tsx

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Save, Loader2 } from 'lucide-react';
import { MonthlyCost } from '../../types/index';
import { EXPENSE_CATEGORIES } from '../../services/monthlyCostsService';
import { useToast } from '../../hooks/useToast';

interface MonthlyExpensePanelProps {
  monthYear: string; // Format: "YYYY-MM"
  monthlyCosts: MonthlyCost[];
  onSave: (data: Partial<MonthlyCost>) => Promise<any>;
}

const MonthlyExpensePanel: React.FC<MonthlyExpensePanelProps> = ({
  monthYear,
  monthlyCosts,
  onSave,
}) => {
  const [expenses, setExpenses] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const { success, error: showError } = useToast();

  // Format month-year for display
  const formatMonthYear = (monthYear: string) => {
    const [year, month] = monthYear.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Load existing expenses when monthYear or monthlyCosts changes
  useEffect(() => {
    const expenseData: Record<string, number> = {};
    let notesText = '';

    EXPENSE_CATEGORIES.forEach((category) => {
      const existing = monthlyCosts.find((cost) => cost.category === category);
      expenseData[category] = existing?.amount || 0;
      if (existing?.notes && !notesText) {
        notesText = existing.notes;
      }
    });

    setExpenses(expenseData);
    setNotes(notesText);
  }, [monthYear, monthlyCosts]);

  const handleExpenseChange = (category: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setExpenses((prev) => ({
      ...prev,
      [category]: numValue,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Save each expense category
      const savePromises = Object.entries(expenses).map(([category, amount]) => {
        if (amount >= 0) {
          return onSave({
            monthYear,
            category,
            amount,
            notes,
          });
        }
        return Promise.resolve();
      });

      await Promise.all(savePromises);

      success('Monthly expenses saved successfully');
    } catch (error) {
      console.error('Error saving monthly expenses:', error);
      showError('Failed to save expenses. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const totalExpenses = Object.values(expenses).reduce((sum, val) => sum + val, 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sticky top-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <DollarSign className="w-6 h-6 text-brand-orange" />
        <div>
          <h3 className="text-xl font-bold text-white">Monthly Expenses</h3>
          <p className="text-sm text-slate-400">{formatMonthYear(monthYear)}</p>
        </div>
      </div>

      {/* Expense Input Fields */}
      <div className="space-y-4 mb-6">
        {EXPENSE_CATEGORIES.map((category) => (
          <div key={category}>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {category}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={expenses[category] || ''}
                onChange={(e) => handleExpenseChange(category, e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any additional notes about this month's expenses..."
          rows={3}
          className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-brand-orange transition-all resize-none"
        />
      </div>

      {/* Total & Save Button */}
      <div className="pt-6 border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-slate-400">Total Operating Expenses</span>
          <span className="text-2xl font-bold text-white">
            ${totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <motion.button
          onClick={handleSave}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full px-6 py-3 bg-brand-orange hover:bg-brand-orange/90 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Monthly Expenses
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default MonthlyExpensePanel;
