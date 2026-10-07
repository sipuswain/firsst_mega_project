import { useState } from "react";
import Modal from "./Modal.jsx";
import Input from "../ui/Input.jsx";
import SelectField from "../ui/SelectField.jsx";
import CheckboxField from "../ui/CheckboxField.jsx";
import Button from "../ui/Button.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import ErrorSummary from "../ui/ErrorSummary.jsx";
import { useMutation } from "../../hooks/useMutation.js";
import { createCouponRequest, updateCouponRequest } from "../../api/coupons.js";
import { buildCouponBody, couponToForm, validateCoupon } from "../../utils/adminForms.js";

const fieldId = (key) => `coupon-${key}`;

// Create (coupon = null) or edit a coupon in a dialog. usedCount is shown but cannot be changed (only orders change it).
// onSaved(message) after a successful save, onClose() on cancel. Values stay in the form when a save fails.
export default function CouponFormDialog({ coupon, onSaved, onClose }) {
  const { busy, run } = useMutation();
  const [values, setValues] = useState(() => couponToForm(coupon));
  const [errors, setErrors] = useState({});
  const [errorSignal, setErrorSignal] = useState(0);
  const [serverError, setServerError] = useState("");
  const [serverSignal, setServerSignal] = useState(0);

  const setField = (key) => (e) => setValues((old) => ({ ...old, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    const found = validateCoupon(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setErrorSignal((n) => n + 1);
      return;
    }
    const body = buildCouponBody(values);
    const result = await run(() => (coupon ? updateCouponRequest(coupon._id, body) : createCouponRequest(body)));
    if (result.skipped) return;
    if (result.ok) {
      onSaved(coupon ? "Coupon saved" : "Coupon created");
      return;
    }
    // a duplicate code ("A coupon with the code ... already exists") also marks the code field
    if (/already exists/i.test(result.error.message)) setErrors({ code: result.error.message });
    setServerError(result.error.message);
    setServerSignal((n) => n + 1);
  };

  return (
    <Modal title={coupon ? "Edit coupon" : "New coupon"} onClose={onClose} busy={busy} size="lg">
      <form onSubmit={submit} noValidate aria-busy={busy} className="mt-4 space-y-4">
        <ErrorSummary errors={errors} idFor={fieldId} signal={errorSignal} />
        <ErrorMessage message={serverError} focusSignal={serverSignal} />

        <Input id={fieldId("code")} data-autofocus label="Code" value={values.code} onChange={setField("code")} error={errors.code} hint="3 to 30 letters, numbers, - or _. Saved in capital letters." disabled={busy} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id={fieldId("discountType")} label="Discount type" value={values.discountType} onChange={setField("discountType")} error={errors.discountType} disabled={busy}>
            <option value="PERCENT">Percent (%)</option>
            <option value="FIXED">Fixed amount (₹)</option>
          </SelectField>
          <Input
            id={fieldId("discountValue")}
            label={values.discountType === "PERCENT" ? "Discount value (%)" : "Discount value (₹)"}
            inputMode="decimal"
            value={values.discountValue}
            onChange={setField("discountValue")}
            error={errors.discountValue}
            hint={values.discountType === "PERCENT" ? "1 to 100" : "More than 0, up to 2 decimals"}
            disabled={busy}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input id={fieldId("minOrderAmount")} label="Minimum order (₹)" inputMode="decimal" value={values.minOrderAmount} onChange={setField("minOrderAmount")} error={errors.minOrderAmount} hint="Empty = no minimum" disabled={busy} />
          <Input id={fieldId("usageLimit")} label="Usage limit" inputMode="numeric" value={values.usageLimit} onChange={setField("usageLimit")} error={errors.usageLimit} hint="Empty = unlimited" disabled={busy} />
        </div>

        <Input id={fieldId("expiresAt")} type="date" label="Expires on" value={values.expiresAt} onChange={setField("expiresAt")} error={errors.expiresAt} hint="Works until the end of this day. Empty = never expires." disabled={busy} />

        <CheckboxField id={fieldId("active")} label="Active" checked={values.active} onChange={(e) => setValues((old) => ({ ...old, active: e.target.checked }))} disabled={busy} hint="An inactive coupon cannot be used." />

        {coupon && (
          <p className="text-sm text-slate-600">
            Used so far: <strong data-testid="coupon-used-count">{coupon.usedCount ?? 0}</strong> (read only)
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? "Saving..." : "Save coupon"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
