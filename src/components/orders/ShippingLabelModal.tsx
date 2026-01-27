// src/components/orders/ShippingLabelModal.tsx
import React from 'react';
import { Order } from '../../types';
import { X, Package, Copy, Check } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

interface ShippingLabelModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order;
}

const ShippingLabelModal: React.FC<ShippingLabelModalProps> = ({ isOpen, onClose, order }) => {
    const toast = useToast();
    const [copiedSection, setCopiedSection] = React.useState<string | null>(null);

    // Set document title for print preview (removes URL from header)
    React.useEffect(() => {
        if (isOpen) {
            const originalTitle = document.title;
            document.title = `Shipping Label - ${order.orderNumber}`;
            return () => {
                document.title = originalTitle;
            };
        }
    }, [isOpen, order.orderNumber]);

    if (!isOpen) return null;

    // Format the shipping address for better display
    const formatAddress = (address: string) => {
        if (!address) return 'No address provided';
        return address;
    };

    // Get the first reference image if available
    const referenceImage = order.mockupUrls?.[0] || order.customerAttachmentUrls?.[0];

    // Copy entire label
    const copyEntireLabel = async () => {
        const labelText = `
ORDER NUMBER: ${order.orderNumber}

SHIP TO: ${order.customerName}
PHONE: ${order.customerPhone || 'N/A'}

SHIPPING ADDRESS:
${formatAddress(order.shippingAddress)}

CARRIER: ${order.shippingCarrier || 'Standard Shipping'}

PRODUCT DETAILS:
Patch Type: ${order.patchesType || 'Custom'}
Backing: ${order.designBacking || 'N/A'}
Quantity: ${order.patchesQuantity?.toLocaleString() || '0'} pieces
        `.trim();

        try {
            await navigator.clipboard.writeText(labelText);
            setCopiedSection('entire');
            toast.success('Entire label copied to clipboard!');
            setTimeout(() => setCopiedSection(null), 2000);
        } catch (err) {
            toast.error('Failed to copy to clipboard');
        }
    };

    // Copy individual section
    const copySection = async (sectionName: string, content: string) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedSection(sectionName);
            toast.success(`${sectionName} copied to clipboard!`);
            setTimeout(() => setCopiedSection(null), 2000);
        } catch (err) {
            toast.error('Failed to copy to clipboard');
        }
    };

    // Format individual sections for copying
    const getOrderNumberText = () => `Order: ${order.orderNumber}`;
    const getShipToText = () => `Ship To: ${order.customerName}\nPhone: ${order.customerPhone || 'N/A'}`;
    const getAddressText = () => `Address:\n${formatAddress(order.shippingAddress)}`;
    const getCarrierText = () => `Carrier: ${order.shippingCarrier || 'Standard Shipping'}`;
    const getProductDetailsText = () => `Patch Type: ${order.patchesType || 'Custom'}\nBacking: ${order.designBacking || 'N/A'}\nQuantity: ${order.patchesQuantity?.toLocaleString() || '0'} pieces`;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:fixed print:inset-0 print:bg-white print:p-0 print:m-0 print:block">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto print:bg-white print:border-0 print:rounded-none print:max-w-full print:max-h-full print:shadow-none print:overflow-visible print:m-0 print:p-0 relative">
                {/* Action Buttons - Only show on screen, not in print */}
                <div className="absolute top-4 right-4 z-20 flex gap-2 print:hidden">
                    <button
                        onClick={copyEntireLabel}
                        className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors group relative"
                        title="Copy entire label"
                    >
                        {copiedSection === 'entire' ? (
                            <Check className="w-6 h-6 text-white" />
                        ) : (
                            <Copy className="w-6 h-6 text-white" />
                        )}
                        <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Copy All
                        </span>
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6 text-slate-300" />
                    </button>
                </div>

                {/* Label Content */}
                <div className="p-8 space-y-6 print:p-4 print:space-y-0">
                    {/* Shipping Label Card */}
                    <div className="bg-white rounded-xl p-8 text-black border-4 border-dashed border-slate-300 print:border-4 print:rounded-none print:p-6">
                        {/* Company Header */}
                        <div className="text-center border-b-2 border-black pb-4 mb-6">
                            <h1 className="text-3xl font-bold">PANDA PATCHES</h1>
                            <p className="text-sm mt-1">Custom Patches & Embroidery</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:grid-cols-2">
                            {/* Left Column - Shipping Details */}
                            <div className="space-y-4">
                                {/* Order Number */}
                                <div className="bg-slate-100 p-4 rounded-lg border-2 border-slate-300 relative group">
                                    <button
                                        onClick={() => copySection('Order Number', getOrderNumberText())}
                                        className="absolute top-2 right-2 p-1.5 bg-white hover:bg-slate-200 rounded-md transition-colors opacity-0 group-hover:opacity-100 print:hidden"
                                        title="Copy order number"
                                    >
                                        {copiedSection === 'Order Number' ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-slate-600" />
                                        )}
                                    </button>
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Order Number</p>
                                    <p className="text-2xl font-bold">{order.orderNumber}</p>
                                </div>

                                {/* Customer Name & Phone */}
                                <div className="relative group">
                                    <button
                                        onClick={() => copySection('Ship To', getShipToText())}
                                        className="absolute top-0 right-0 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors opacity-0 group-hover:opacity-100 print:hidden"
                                        title="Copy ship to info"
                                    >
                                        {copiedSection === 'Ship To' ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-slate-600" />
                                        )}
                                    </button>
                                    <div>
                                        <p className="text-xs font-bold uppercase text-slate-600 mb-1">Ship To</p>
                                        <p className="text-xl font-bold">{order.customerName}</p>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-xs font-bold uppercase text-slate-600 mb-1">Phone</p>
                                        <p className="text-lg font-semibold">{order.customerPhone || 'N/A'}</p>
                                    </div>
                                </div>

                                {/* Shipping Address */}
                                <div className="relative group">
                                    <button
                                        onClick={() => copySection('Address', getAddressText())}
                                        className="absolute top-0 right-0 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors opacity-0 group-hover:opacity-100 print:hidden"
                                        title="Copy shipping address"
                                    >
                                        {copiedSection === 'Address' ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-slate-600" />
                                        )}
                                    </button>
                                    <p className="text-xs font-bold uppercase text-slate-600 mb-1">Shipping Address</p>
                                    <p className="text-base font-medium leading-relaxed whitespace-pre-line">
                                        {formatAddress(order.shippingAddress)}
                                    </p>
                                </div>

                                {/* Carrier */}
                                <div className="relative group">
                                    <button
                                        onClick={() => copySection('Carrier', getCarrierText())}
                                        className="absolute top-0 right-0 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors opacity-0 group-hover:opacity-100 print:hidden"
                                        title="Copy carrier info"
                                    >
                                        {copiedSection === 'Carrier' ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-slate-600" />
                                        )}
                                    </button>
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
                                <div className="space-y-3 relative group">
                                    <button
                                        onClick={() => copySection('Product Details', getProductDetailsText())}
                                        className="absolute -top-2 right-0 p-1.5 bg-white hover:bg-slate-200 rounded-md transition-colors opacity-0 group-hover:opacity-100 print:hidden border border-slate-300 z-10"
                                        title="Copy all product details"
                                    >
                                        {copiedSection === 'Product Details' ? (
                                            <Check className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-slate-600" />
                                        )}
                                    </button>
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

                    </div>

                    {/* Print and Copy Instructions */}
                    <div className="bg-slate-700/50 rounded-lg p-4 print:hidden">
                        <div className="text-center mb-3">
                            <p className="text-slate-300 text-sm">
                                Use Ctrl+P (Windows) or Cmd+P (Mac) to print this shipping label
                            </p>
                        </div>
                        <div className="text-center border-t border-slate-600 pt-3">
                            <p className="text-slate-400 text-xs">
                                Hover over any section to copy it individually, or use the <Copy className="w-3 h-3 inline" /> button at the top to copy everything
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShippingLabelModal;
