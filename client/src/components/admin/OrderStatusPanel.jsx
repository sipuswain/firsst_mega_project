import { useState } from "react";
import { useMutation } from "../../hooks/useMutation.js";
import { useToast } from "../../hooks/useToast.js";
import { changeOrderStatusRequest } from "../../api/admin.js";
import { adminActions, statusInfo } from "../../utils/orderStatus.js";
import { formatPrice } from "../../utils/format.js";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Button from "../ui/Button.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";

// The status buttons of one order. It shows ONLY the changes the backend allows (see adminActions in utils/orderStatus.js).
//   onChanged()      the order must be loaded again (after a change, or when the server says it was changed by someone else)
//   onProblem(text)  tells the page to show a message (kept when the page reloads the order)
export default function OrderStatusPanel({ order, onChanged, onProblem }) {
  const toast = useToast();
  const { busy, run } = useMutation();
  const actions = adminActions(order);
  const [cancelling, setCancelling] = useState(false); // is the confirm dialog open?
  const [error, setError] = useState(""); // a message for the dialog (or for the panel when no dialog is open)
  const [errorSignal, setErrorSignal] = useState(0);

  if (!actions.forward && !actions.canCancel) {
    return <p className="text-sm text-slate-600">This order is {statusInfo(order.status).label.toLowerCase()}. Its status cannot be changed any more.</p>;
  }

  const change = async (to) => {
    setError("");
    const result = await run(() => changeOrderStatusRequest(order._id, to));
    if (result.skipped) return; // a change is already running
    if (result.ok) {
      setCancelling(false);
      toast.success(`Order is now ${statusInfo(to).label.toLowerCase()}`);
      onChanged();
      return;
    }
    const { status, message } = result.error;
    if (status === 400 || status === 404 || status === 409) {
      // the order is not what we thought (someone else changed it): show the reason and load the order again
      setCancelling(false);
      onProblem(message);
      onChanged();
    } else {
      // for example 502 "the refund failed": nothing was changed, the admin can try again
      setError(message);
      setErrorSignal((n) => n + 1);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.forward && (
          <Button loading={busy && !cancelling} disabled={busy || Boolean(actions.forward.blockedReason)} aria-describedby={actions.forward.blockedReason ? "forward-reason" : undefined} onClick={() => change(actions.forward.to)}>
            {actions.forward.label}
          </Button>
        )}
        {actions.canCancel && (
          <Button variant="danger" disabled={busy} onClick={() => { setError(""); setCancelling(true); }}>
            Cancel order
          </Button>
        )}
      </div>

      {actions.forward?.blockedReason && (
        <p id="forward-reason" className="text-sm text-amber-800">
          {actions.forward.blockedReason}
        </p>
      )}
      {!cancelling && error && <ErrorMessage message={error} focusSignal={errorSignal} />}

      {cancelling && (
        <ConfirmDialog
          title="Cancel this order?"
          confirmLabel={actions.refundOnCancel ? "Cancel and refund" : "Yes, cancel order"}
          busyLabel={actions.refundOnCancel ? "Refunding..." : "Cancelling..."}
          danger
          busy={busy}
          error={error}
          onConfirm={() => change("CANCELLED")}
          onCancel={() => setCancelling(false)}
        >
          {actions.refundOnCancel ? (
            <p>
              The customer already paid for this order online. If you cancel it, <strong>a full refund of {formatPrice(order.total)}</strong> will be made through Razorpay. The order is only cancelled when the refund works.
            </p>
          ) : (
            <p>The order will be cancelled and its items go back into stock.</p>
          )}
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
