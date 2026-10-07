import Modal from "./Modal.jsx";
import Button from "../ui/Button.jsx";

// "Are you sure?" dialog. The focus starts on Cancel (the safe button).
//   children = the explanation text, error = a message to show inside (for example when the server refused),
//   busy = the action is running (both buttons are blocked, Escape does nothing)
export default function ConfirmDialog({ title, children, confirmLabel = "Confirm", busyLabel = "Working...", danger = false, busy = false, error = "", onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} busy={busy}>
      <div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div>
      {error && (
        <p role="alert" className="mt-3 break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" data-autofocus disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
