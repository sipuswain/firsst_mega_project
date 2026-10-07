// The fields of the shipping address. Each field has the id "checkout-<name>", so the error summary can focus it.
export const addressFieldId = (name) => `checkout-${name}`;

export const ADDRESS_LABELS = {
  fullName: "Full name", phone: "Phone", addressLine1: "Address", addressLine2: "Address line 2", city: "City", state: "State", pincode: "Pincode",
};

