// src/pages/NewQuotePage.tsx - Create Quote Page

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createQuote } from '../services/quoteService';
import { Quote } from '../types/index';
import { queryKeys } from '../constants/queryKeys';
import Button from '../components/ui/Button';
import SpotlightCard from '../components/ui/SpotlightCard';
import UnsavedChangesModal from "../components/ui/UnsavedChangesModal";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { useWarnIfUnsaved } from "../hooks";
import { ArrowLeft, Upload, X } from "lucide-react";

const NewQuotePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { success: showSuccess, error: showError } = useToast();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [navigateTo, setNavigateTo] = useState<string | null>(null);
  const [allowNavigation, setAllowNavigation] = useState(false);
  
  const { showModal, confirmLeave, cancelLeave } = useWarnIfUnsaved(isDirty, allowNavigation);
  
  React.useEffect(() => {
    if (navigateTo && allowNavigation) {
      navigate(navigateTo);
    }
  }, [navigateTo, allowNavigation, navigate]);
  
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerProfileUrl: '',
    
    designName: '',
    patchesQuantity: '',
    patchesType: '',
    designSize: '',
    designBacking: '',
    instructions: '',
    
    estimatedAmount: '',
    salesAgent: user?.email || '',
    leadSource: '',
    
    notes: '',
  });

  const [mockupFiles, setMockupFiles] = useState<File[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setIsDirty(true);
  };

  const handleMockupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setMockupFiles(prev => [...prev, ...Array.from(files)]);
      setIsDirty(true);
    }
  };

  const removeMockupFile = (index: number) => {
    setMockupFiles(prev => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // Upload mockup files to Supabase storage
      const mockupUrls: string[] = [];
      
      if (mockupFiles.length > 0) {
        const { supabase } = await import('../services/supabaseClient');
        
        for (const file of mockupFiles) {
          const timestamp = Date.now();
          const filename = `mockup_${timestamp}_${file.name}`;
          const filepath = `quotes/${filename}`;
          
          const { data, error } = await supabase.storage
            .from('quote-mockups')
            .upload(filepath, file);
          
          if (error) {
            throw new Error(`Failed to upload mockup: ${error.message}`);
          }
          
          // Get public URL
          const { data: urlData } = supabase.storage
            .from('quote-mockups')
            .getPublicUrl(filepath);
          
          mockupUrls.push(urlData.publicUrl);
        }
      }

      const quotePayload: Omit<Quote, 'id' | 'quoteNumber' | 'createdAt' | 'updatedAt'> = {
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        customerProfileUrl: formData.customerProfileUrl,
        
        designName: formData.designName,
        patchesQuantity: formData.patchesQuantity ? Number(formData.patchesQuantity) : undefined,
        patchesType: formData.patchesType,
        designSize: formData.designSize,
        designBacking: formData.designBacking,
        instructions: formData.instructions,
        
        estimatedAmount: formData.estimatedAmount ? Number(formData.estimatedAmount) : undefined,
        salesAgent: formData.salesAgent,
        leadSource: formData.leadSource,
        
        notes: formData.notes,
        mockupUrls: mockupUrls,
        customerAttachmentUrls: [],
      };

      const quote = await createQuote(quotePayload);
      
      // Invalidate quotes cache
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all() });
      
      setIsDirty(false);
      setIsSaving(false);
      showSuccess(`Quote ${quote.quoteNumber} created successfully!`);
      
      // Navigate to quotes list
      setTimeout(() => {
        navigate('/quotes');
      }, 500);
    } catch (error) {
      showError(`Failed to create quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 min-h-screen pb-10">
      {/* Unsaved Changes Warning */}
      {showModal && (
        <UnsavedChangesModal
          onConfirm={confirmLeave}
          onCancel={cancelLeave}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            if (isDirty) {
              setNavigateTo('/quotes');
            } else {
              navigate('/quotes');
            }
          }}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-300" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-white">New Quote</h1>
          <p className="text-slate-300 text-sm mt-1">Create a new quote request</p>
        </div>
      </div>

      {/* Quote Form */}
      <SpotlightCard className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Customer Information Section */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Customer Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Customer Name *</label>
                <input
                  type="text"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email *</label>
                <input
                  type="email"
                  name="customerEmail"
                  value={formData.customerEmail}
                  onChange={handleChange}
                  required
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Phone</label>
                <input
                  type="tel"
                  name="customerPhone"
                  value={formData.customerPhone}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Profile URL</label>
                <input
                  type="url"
                  name="customerProfileUrl"
                  value={formData.customerProfileUrl}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          {/* Design Details Section */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Design Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Design Name</label>
                <input
                  type="text"
                  name="designName"
                  value={formData.designName}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="e.g., Logo Design"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Quantity</label>
                <input
                  type="number"
                  name="patchesQuantity"
                  value={formData.patchesQuantity}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="100"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Patch Type</label>
                <select
                  name="patchesType"
                  value={formData.patchesType}
                  onChange={handleChange}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all appearance-none cursor-pointer hover:border-slate-500"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ea580c' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="">Select type...</option>
                  <option value="Embroidered">Embroidered</option>
                  <option value="Woven">Woven</option>
                  <option value="PVC">PVC</option>
                  <option value="Printed">Printed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Size</label>
                <input
                  type="text"
                  name="designSize"
                  value={formData.designSize}
                  onChange={handleChange}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="4x2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Backing</label>
                <select
                  name="designBacking"
                  value={formData.designBacking}
                  onChange={handleChange}
                  className="w-full bg-slate-900 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all appearance-none cursor-pointer hover:border-slate-500"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23ea580c' d='M10.293 3.293L6 7.586 1.707 3.293A1 1 0 00.293 4.707l5 5a1 1 0 001.414 0l5-5a1 1 0 10-1.414-1.414z'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    paddingRight: '2.5rem'
                  }}
                >
                  <option value="">Select backing...</option>
                  <option value="Iron On">Iron On</option>
                  <option value="Sew On">Sew On</option>
                  <option value="Velcro">Velcro</option>
                  <option value="Adhesive">Adhesive</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Special Instructions</label>
              <textarea
                name="instructions"
                value={formData.instructions}
                onChange={handleChange}
                rows={4}
                className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                placeholder="Any special requirements or notes..."
              />
            </div>

            {/* Mockup Upload Section */}
            <div className="mt-6 pt-4 border-t border-slate-700">
              <label className="block text-sm font-medium text-slate-300 mb-3">Upload Mockup Images</label>
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center hover:border-brand-orange/50 transition-colors cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleMockupUpload}
                  className="hidden"
                  id="mockup-upload"
                />
                <label htmlFor="mockup-upload" className="cursor-pointer block">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-300 text-sm font-medium">Click to upload mockup images</p>
                  <p className="text-slate-400 text-xs mt-1">PNG, JPG up to 10MB each</p>
                </label>
              </div>

              {/* Display uploaded files */}
              {mockupFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-slate-300">{mockupFiles.length} file(s) selected:</p>
                  {mockupFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-slate-800/50 border border-slate-600 rounded-lg p-3">
                      <span className="text-sm text-slate-300 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeMockupFile(index)}
                        className="p-1 hover:bg-red-600/20 rounded transition-colors"
                      >
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Financials Section */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Quote Amount</h2>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Quote Amount ($)</label>
              <input
                type="number"
                name="estimatedAmount"
                value={formData.estimatedAmount}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Sales Information Section */}
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Sales Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Sales Agent</label>
                <input
                  type="text"
                  name="salesAgent"
                  value={formData.salesAgent}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Lead Source</label>
                <input
                  type="text"
                  name="leadSource"
                  value={formData.leadSource}
                  onChange={handleChange}
                  className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
                  placeholder="e.g., Google, Referral, Direct"
                />
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Internal Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              className="w-full bg-slate-800/50 border border-slate-600 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange transition-all placeholder-slate-400"
              placeholder="Internal notes only..."
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-6 border-t border-slate-700">
            <Button
              variant="secondary"
              onClick={() => {
                if (isDirty) {
                  setNavigateTo('/quotes');
                } else {
                  navigate('/quotes');
                }
              }}
              className="bg-slate-800 border border-slate-600 text-white hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSaving}
              className="shadow-lg shadow-brand-orange/20"
            >
              {isSaving ? 'Creating Quote...' : 'Create Quote'}
            </Button>
          </div>
        </form>
      </SpotlightCard>
    </div>
  );
};

export default NewQuotePage;
