'use client';

export default function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#e8e8e8] mb-3">{title}</h3>
        <p className="text-sm text-[#a0a0a0] mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-[#2a2a2a] rounded-md text-[#a0a0a0] hover:text-[#e8e8e8] hover:border-[#444] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-[#4a9eff] text-black font-semibold rounded-md hover:bg-[#3b8de6] transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
