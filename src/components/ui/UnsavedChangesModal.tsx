import React from "react";

interface UnsavedChangesModalProps {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  show,
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
      <div className="bg-slate-800 text-white rounded-xl shadow-xl w-[90%] max-w-md p-6 border border-slate-700">
        <h2 className="text-lg font-semibold mb-2">Unsaved Changes</h2>
        <p className="text-slate-400 mb-6">
          You have unsaved changes. Are you sure you want to leave this page?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 transition"
          >
            Stay
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 transition"
          >
            Discard & Leave
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnsavedChangesModal;