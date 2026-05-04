import React, { useState, useEffect } from 'react';
import { useCustomerAuth } from '../../contexts/CustomerAuthContext';
import { supabase } from '../../services/supabaseClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Mail, Building, Phone, Save, MapPin } from 'lucide-react';

const CustomerProfilePage: React.FC = () => {
  const { profile, user } = useCustomerAuth();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultShippingAddress, setDefaultShippingAddress] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setCompanyName(profile.company_name || '');
      setPhone(profile.phone || '');
      setDefaultShippingAddress((profile as any).default_shipping_address || '');
    }
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('customer_profiles')
        .update({
          full_name: fullName.trim() || null,
          company_name: companyName.trim() || null,
          phone: phone.trim() || null,
          default_shipping_address: defaultShippingAddress.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto animate-fadeIn">
      <h1 className="text-2xl font-bold text-white mb-6">My Profile</h1>

      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email (read-only) */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <Mail className="w-4 h-4" /> Email Address
            </label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="w-full bg-slate-800/30 border border-slate-700 rounded-xl px-4 py-3 text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-600 mt-1">This is the email linked to your orders. It cannot be changed.</p>
          </div>

          {/* Full Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <User className="w-4 h-4" /> Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange/50"
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <Building className="w-4 h-4" /> Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company (optional)"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange/50"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <Phone className="w-4 h-4" /> Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Your phone number (optional)"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange/50"
            />
          </div>

          {/* Default Shipping Address */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <MapPin className="w-4 h-4" /> Default Shipping Address
            </label>
            <textarea
              value={defaultShippingAddress}
              onChange={(e) => setDefaultShippingAddress(e.target.value)}
              placeholder="123 Main St, Apt 4B&#10;Austin, TX 78701&#10;United States"
              rows={4}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-orange/50 focus:border-brand-orange/50 resize-none"
            />
            <p className="text-xs text-slate-600 mt-1">
              Saved here for your records. Each order's shipping address is set when the order is placed.
            </p>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="w-full sm:w-auto bg-brand-orange text-white font-semibold px-8 py-3 rounded-xl hover:bg-brand-orange/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-orange/20 flex items-center justify-center gap-2"
            >
              {updateProfile.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <Save className="w-4 h-4" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              )}
            </button>
          </div>

          {updateProfile.isError && (
            <p className="text-sm text-red-400">Failed to save. Please try again.</p>
          )}
        </form>
      </div>

      {/* Account Info */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mt-6">
        <h3 className="text-sm font-semibold text-white mb-3">Account Info</h3>
        <div className="text-xs text-slate-500 space-y-1">
          <p>Member since: {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}</p>
          <p>Last login: {profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString() : '—'}</p>
        </div>
      </div>
    </div>
  );
};

export default CustomerProfilePage;
