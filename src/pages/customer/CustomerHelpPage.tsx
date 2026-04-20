import React from 'react';
import { MessageCircle, Mail, Clock, Package, HelpCircle, ChevronDown } from 'lucide-react';

const faqs = [
  {
    q: 'How do I track my order?',
    a: 'Go to "My Orders" from the menu. Click on any order to see the full journey timeline showing exactly where your patches are in the process.',
  },
  {
    q: 'How long does production take?',
    a: 'Standard orders typically take 7-10 business days for production. Rush orders can be completed faster — contact us for details.',
  },
  {
    q: 'Can I make changes to my order?',
    a: 'If your order is still in the design phase, changes may be possible. Use the chat widget to contact our team as soon as possible.',
  },
  {
    q: 'What if I\'m not happy with the mockup?',
    a: 'When your mockup is ready, you\'ll see "Awaiting Your Approval" on the timeline. You can request revisions at no extra charge.',
  },
  {
    q: 'How do I reorder the same design?',
    a: 'Contact our team through the chat widget with your previous order number and we\'ll set it up quickly.',
  },
  {
    q: 'Why can\'t I see my orders?',
    a: 'Make sure you\'re logged in with the same email address you used to place your order. If you used a different email, try logging in with that one.',
  },
];

const CustomerHelpPage: React.FC = () => {
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto animate-fadeIn space-y-6">
      <h1 className="text-2xl font-bold text-white">Help & Support</h1>

      {/* Contact Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-400/10 rounded-xl">
              <MessageCircle className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-white">Live Chat</h3>
          </div>
          <p className="text-sm text-slate-400 mb-3">
            Chat with our team instantly using the chat widget in the bottom right corner.
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-3 h-3" />
            <span>Mon-Fri, 9am - 6pm EST</span>
          </div>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-brand-orange/10 rounded-xl">
              <Mail className="w-5 h-5 text-brand-orange" />
            </div>
            <h3 className="text-base font-semibold text-white">Email Us</h3>
          </div>
          <p className="text-sm text-slate-400 mb-3">
            Send us an email and we'll get back to you within 24 hours.
          </p>
          <a
            href="mailto:hello@pandapatches.com"
            className="text-sm text-brand-orange hover:underline"
          >
            hello@pandapatches.com
          </a>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-slate-400" />
          Frequently Asked Questions
        </h3>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="border border-slate-700/50 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-all"
              >
                <span className="text-sm font-medium text-white">{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openFaq === i && (
                <div className="px-4 pb-3 text-sm text-slate-400">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomerHelpPage;
