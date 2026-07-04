import React from 'react';
import Modal from './Modal';
import Spinner from './Spinner';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmButtonText?: string;
  isConfirming?: boolean;
  /** 'danger' turns the confirm button red — use for destructive actions (delete, clear). */
  variant?: 'primary' | 'danger';
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmButtonText = 'Confirm',
  isConfirming = false,
  variant = 'primary',
}) => {
  const titleId = React.useId();
  const confirmClasses =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500/50'
      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500/50';

  return (
    <Modal isOpen={isOpen} onClose={onClose} labelledBy={titleId} size="md">
      <div className="p-6">
        <h3 id={titleId} className="text-lg font-semibold text-slate-100 mb-4">
          {title}
        </h3>
        <p className="mt-2 text-slate-300">{message}</p>
        <div className="mt-6 flex justify-end gap-4">
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirming}
            className={`px-4 py-2 rounded-lg text-white font-medium focus:ring-2 shadow-lg shadow-black/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${confirmClasses}`}
          >
            {isConfirming && <Spinner small />}
            {confirmButtonText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
