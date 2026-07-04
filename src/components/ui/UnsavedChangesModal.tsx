import React from "react";
import Modal from "./Modal";

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
  const titleId = React.useId();

  return (
    <Modal isOpen={show} onClose={onCancel} labelledBy={titleId} size="sm">
      <div className="p-6 text-white">
        <h2 id={titleId} className="text-lg font-semibold mb-2">Unsaved Changes</h2>
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
            Discard &amp; Leave
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default UnsavedChangesModal;
