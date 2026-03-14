'use client';

export default function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 text-sm bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-emerald-600 shadow-md hover:shadow-lg hover:shadow-emerald-200/50 transition-all duration-200"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
