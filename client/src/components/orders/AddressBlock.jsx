// The delivery address of an order (plain text, no HTML).
export default function AddressBlock({ address }) {
  return (
    <address className="break-words text-sm not-italic leading-6 text-slate-700">
      <span className="font-medium text-slate-900">{address.fullName}</span>
      <br />
      {address.addressLine1}
      <br />
      {address.addressLine2 && (
        <>
          {address.addressLine2}
          <br />
        </>
      )}
      {address.city}, {address.state} {address.pincode}
      <br />
      {address.country}
      <br />
      Phone: {address.phone}
    </address>
  );
}
