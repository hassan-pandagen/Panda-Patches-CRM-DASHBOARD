// src/components/orders/ShippingLabelModal.tsx
import React from 'react';
import { Order } from '../../types';
import { X, Package } from 'lucide-react';

interface ShippingLabelModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
}

const ShippingLabelModal: React.FC<ShippingLabelModalProps> = ({ isOpen, onClose, order }) => {
    if (!isOpen) return null;

    // Format the shipping address for better display
    const formatAddress = (address: string) => {
        if (!address) return 'No address provided';
        return address;
    };

    // Get the first reference image if available
    const referenceImage = order.mockupUrls?.[0] || order.customerAttachmentUrls?.[0];

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-orange/10 rounded-lg">
                            <Package className="w-6 h-6 text-brand-orange" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Shipping Label</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-400" />
                    </button>
                </div>

                {/* Label Content */}
                <div className="p-8 space-y-6">
                    {/* Shipping Label Card */}
                    <div className="bg-white rounded-xl p-8 text-black border-4 border-dashed border-slate-300">
                        {/* Company Header */}
                        <div className="text-center border-b-2 border-black pb-4 mb-6">
                            <h1 className="text-3xl font-bold">PANDA PATCHES</h1>
                            <p className="text-sm mt-1">Custom Patches & Embroidery</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left Column - Shipping Details */}
                            <div className="space-y-4">
                                {/* Order Number */}
                                <div className="bg-slate-100 p-4 rounded-lg border-2 border-slate-300">
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Order Number</p>
                                    <p className="text-2xl font-bold">{order.orderNumber}</p>
                                </div>

                                {/* Customer Name */}
                                <div>
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Ship To</p>
                                    <p className="text-xl font-bold">{order.customerName}</p>
                                </div>

                                {/* Phone */}
                                <div>
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Phone</p>
                                    <p className="text-lg font-semibold">{order.customerPhone || 'N/A'}</p>
                                </div>

                                {/* Shipping Address */}
                                <div>
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Shipping Address</p>
                                    <p className="text-base font-medium leading-relaxed whitespace-pre-line">
                                        {formatAddress(order.shippingAddress)}
                                    </p>
                                </div>

                                {/* Carrier */}
                                <div>
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Carrier</p>
                                    <p className="text-lg font-semibold">{order.shippingCarrier || 'Standard Shipping'}</p>
                                </div>
                            </div>

                            {/* Right Column - Product Details & Image */}
                            <div className="space-y-4">
                                {/* Reference Image */}
                                {referenceImage && (
                                    <div className="border-2 border-slate-300 rounded-lg overflow-hidden">
                                        <img
                                            src={referenceImage}
                                            alt="Product Reference"
                                            className="w-full h-48 object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 fill=%22%23CBD5E1%22 viewBox=%220 0 24 24%22%3E%3Cpath d=%22M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75-3.54L6 17h12l-3.96-5.29z%22/%3E%3C/svg%3E';
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Product Details */}
                                <div className="space-y-3">
                                    <div className="bg-slate-100 p-3 rounded-lg">
                                        <p className="text-xs font-bold uppercase text-slate-600 mb-1">Patch Type</p>
                                        <p className="text-lg font-semibold">{order.patchesType || 'Custom'}</p>
                                    </div>

                                    <div className="bg-slate-100 p-3 rounded-lg">
                                        <p className="text-xs font-bold uppercase text-slate-600 mb-1">Backing</p>
                                        <p className="text-lg font-semibold">{order.designBacking || 'N/A'}</p>
                                    </div>

                                    <div className="bg-slate-100 p-3 rounded-lg">
                                        <p className="text-xs font-bold uppercase text-slate-600 mb-1">Quantity</p>
                                        <p className="text-2xl font-bold">{order.patchesQuantity?.toLocaleString() || '0'} <span className="text-sm font-normal">pieces</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer with Special Instructions if any */}
                        {order.instructions && (
                            <div className="mt-6 pt-4 border-t-2 border-slate-300">
                                <p className="text-xs font-bold uppercase text-slate-600 mb-2">Special Instructions</p>
                                <p className="text-sm font-medium">{order.instructions}</p>
                            </div>
                        )}

                        {/* Barcode Placeholder */}
                        <div className="mt-6 flex justify-center">
                            <div className="bg-slate-100 px-6 py-3 rounded border-2 border-slate-300">
                                <div className="flex gap-1 mb-2">
                                    {[...Array(12)].map((_, i) => (
                                        <div key={i} className="w-1 h-16 bg-black" style={{ width: i % 2 === 0 ? '2px' : '4px' }} />
                                    ))}
                                </div>
                                <p className="text-center text-xs font-mono font-bold">{order.orderNumber}</p>
                            </div>
                        </div>
                    </div>

                    {/* Print Instructions */}
                    <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                        <p className="text-slate-300 text-sm">
                            Use Ctrl+P (Windows) or Cmd+P (Mac) to print this shipping label
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShippingLabelModal;
