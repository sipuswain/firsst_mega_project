import Input from "../ui/Input.jsx";

import { addressFieldId, ADDRESS_LABELS } from "./addressFields.js";

export default function AddressForm({ values, errors, onChange }) {
  const field = (name, props = {}) => (
    <Input
      id={addressFieldId(name)}
      label={`${ADDRESS_LABELS[name]}${name === "addressLine2" ? " (optional)" : ""}`}
      value={values[name]}
      onChange={(e) => onChange(name, e.target.value)}
      error={errors[name]}
      {...props}
    />
  );
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="mb-3 text-lg font-semibold">Delivery address</legend>
      {field("fullName", { autoComplete: "name", className: "sm:col-span-2" })}
      {field("phone", { autoComplete: "tel-national", inputMode: "numeric", maxLength: 10, hint: "10 digit mobile number" })}
      {field("pincode", { autoComplete: "postal-code", inputMode: "numeric", maxLength: 6 })}
      {field("addressLine1", { autoComplete: "address-line1", className: "sm:col-span-2" })}
      {field("addressLine2", { autoComplete: "address-line2", className: "sm:col-span-2" })}
      {field("city", { autoComplete: "address-level2" })}
      {field("state", { autoComplete: "address-level1" })}
      <p className="text-sm text-slate-500 sm:col-span-2">Country: India (we only deliver in India for now).</p>
    </fieldset>
  );
}
