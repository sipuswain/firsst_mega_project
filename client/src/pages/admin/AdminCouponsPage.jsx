import { useState } from "react";
import { useApi } from "../../hooks/useApi.js";
import { useMutation } from "../../hooks/useMutation.js";
import { useToast } from "../../hooks/useToast.js";
import { listCouponsRequest, deleteCouponRequest } from "../../api/coupons.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import DataTable from "../../components/admin/DataTable.jsx";
import ConfirmDialog from "../../components/admin/ConfirmDialog.jsx";
import CouponFormDialog from "../../components/admin/CouponFormDialog.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import { formatDate, formatPrice } from "../../utils/format.js";

// Marks the coupons whose expiry date has passed. Done when the list is loaded (not while drawing the page).
const markExpired = (data) => {
  const now = Date.now();
  return { ...data, coupons: data.coupons.map((coupon) => ({ ...coupon, expired: Boolean(coupon.expiresAt) && new Date(coupon.expiresAt).getTime() < now })) };
};

const discountText = (coupon) => (coupon.discountType === "PERCENT" ? `${coupon.discountValue}% off` : `${formatPrice(coupon.discountValue)} off`);

// Coupons: list, create, edit, delete (all ADMIN only on the server).
export default function AdminCouponsPage() {
  const toast = useToast();
  const { busy, run } = useMutation();
  const coupons = useApi((signal) => listCouponsRequest(signal).then(markExpired), []);
  // which dialog is open: { type: "form", coupon } (coupon null = new) | { type: "delete", coupon }
  const [dialog, setDialog] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const saved = (message) => {
    toast.success(message);
    setDialog(null);
    coupons.reload();
  };

  const confirmDelete = async () => {
    setDeleteError("");
    const result = await run(() => deleteCouponRequest(dialog.coupon._id));
    if (result.skipped) return;
    if (result.ok) saved("Coupon deleted");
    else setDeleteError(result.error.message);
  };

  const columns = [
    { key: "code", header: "Code", className: "break-all font-mono text-xs font-semibold", render: (c) => c.code },
    { key: "discount", header: "Discount", className: "whitespace-nowrap", render: discountText },
    { key: "min", header: "Min order", className: "whitespace-nowrap", render: (c) => (c.minOrderAmount > 0 ? formatPrice(c.minOrderAmount) : "-") },
    { key: "used", header: "Used", className: "whitespace-nowrap", render: (c) => `${c.usedCount ?? 0} / ${c.usageLimit ?? "unlimited"}` },
    { key: "expires", header: "Expires", className: "whitespace-nowrap", render: (c) => (c.expiresAt ? formatDate(c.expiresAt) : "never") },
    {
      key: "status",
      header: "Status",
      render: (c) => (c.expired ? <Badge tone="red">Expired</Badge> : c.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>),
    },
    {
      key: "actions",
      header: "Actions",
      className: "whitespace-nowrap",
      render: (c) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" aria-label={`Edit coupon ${c.code}`} onClick={() => setDialog({ type: "form", coupon: c })}>
            Edit
          </Button>
          <Button variant="secondary" size="sm" aria-label={`Delete coupon ${c.code}`} onClick={() => { setDeleteError(""); setDialog({ type: "delete", coupon: c }); }}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeading title="Coupons" subtitle="Discount codes for the cart" action={<Button onClick={() => setDialog({ type: "form", coupon: null })}>New coupon</Button>} />

      <DataTable
        caption="Coupons"
        columns={columns}
        rows={coupons.data?.coupons}
        getKey={(c) => c._id}
        loading={coupons.loading}
        error={coupons.error}
        onRetry={coupons.reload}
        emptyTitle="No coupons yet"
        emptyText="Create a discount code that customers can use in their cart."
        emptyAction={<Button onClick={() => setDialog({ type: "form", coupon: null })}>New coupon</Button>}
      />

      {dialog?.type === "form" && <CouponFormDialog coupon={dialog.coupon} onSaved={saved} onClose={() => setDialog(null)} />}
      {dialog?.type === "delete" && (
        <ConfirmDialog title="Delete this coupon?" confirmLabel="Delete coupon" busyLabel="Deleting..." danger busy={busy} error={deleteError} onConfirm={confirmDelete} onCancel={() => setDialog(null)}>
          <p className="break-words">
            The code <strong>{dialog.coupon.code}</strong> will stop working. Old orders keep their own copy of the discount.
          </p>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
