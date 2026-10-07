import { describe, expect, it } from "vitest";
import { buildShippingAddress, isValidEmail, validateAddress, validateChangePassword, validateForgot, validateLogin, validateReset, validateSignup } from "./validation.js";

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    for (const ok of ["a@b.co", " user.name+tag@example.com "]) expect(isValidEmail(ok)).toBe(true);
  });
  it("refuses bad ones", () => {
    for (const bad of ["", "abc", "a@b", "a b@c.com", "@b.com", "a@.com", undefined, 5]) expect(isValidEmail(bad)).toBe(false);
  });
});

describe("validateSignup", () => {
  const good = { name: "Alice", email: "alice@example.com", password: "12345678" };
  it("passes good values", () => expect(validateSignup(good)).toEqual({}));
  it("name: required and at most 25 characters (like the backend)", () => {
    expect(validateSignup({ ...good, name: "  " }).name).toMatch(/required/);
    expect(validateSignup({ ...good, name: "x".repeat(26) }).name).toMatch(/at most 25/);
    expect(validateSignup({ ...good, name: "x".repeat(25) })).toEqual({});
  });
  it("password: at least 8 characters", () => {
    expect(validateSignup({ ...good, password: "1234567" }).password).toMatch(/at least 8/);
    expect(validateSignup({ ...good, password: "" }).password).toMatch(/required/);
  });
  it("email: valid format", () => expect(validateSignup({ ...good, email: "nope" }).email).toMatch(/valid email/));
  it("reports every problem at once", () => expect(Object.keys(validateSignup({ name: "", email: "", password: "" }))).toEqual(["name", "email", "password"]));
});

describe("validateLogin / validateForgot", () => {
  it("login needs an email and a password (any length: the backend decides)", () => {
    expect(validateLogin({ email: "a@b.co", password: "x" })).toEqual({});
    expect(Object.keys(validateLogin({ email: "", password: "" }))).toEqual(["email", "password"]);
  });
  it("forgot needs a valid email", () => {
    expect(validateForgot({ email: "a@b.co" })).toEqual({});
    expect(validateForgot({ email: "a" }).email).toBeTruthy();
  });
});

describe("validateReset", () => {
  it("passwords must match and be 8+ characters", () => {
    expect(validateReset({ password: "12345678", confirmPassword: "12345678" })).toEqual({});
    expect(validateReset({ password: "12345678", confirmPassword: "1234567x" }).confirmPassword).toMatch(/do not match/);
    expect(validateReset({ password: "123", confirmPassword: "123" }).password).toMatch(/at least 8/);
    expect(validateReset({ password: "12345678", confirmPassword: "" }).confirmPassword).toMatch(/repeat/);
  });
});

describe("validateChangePassword", () => {
  it("old password required, new 8+ and different", () => {
    expect(validateChangePassword({ oldPassword: "oldpass12", newPassword: "newpass12" })).toEqual({});
    expect(validateChangePassword({ oldPassword: "", newPassword: "newpass12" }).oldPassword).toBeTruthy();
    expect(validateChangePassword({ oldPassword: "oldpass12", newPassword: "short" }).newPassword).toMatch(/at least 8/);
    expect(validateChangePassword({ oldPassword: "samepass12", newPassword: "samepass12" }).newPassword).toMatch(/different/);
  });
});

describe("validateAddress / buildShippingAddress", () => {
  const good = { fullName: "Asha Rao", phone: "9876543210", addressLine1: "12 MG Road", addressLine2: "", city: "Pune", state: "Maharashtra", pincode: "411001" };

  it("accepts a good address", () => {
    expect(validateAddress(good)).toEqual({});
  });
  it("phone: 10 digits starting with 6-9", () => {
    expect(validateAddress({ ...good, phone: "5876543210" }).phone).toBeTruthy();
    expect(validateAddress({ ...good, phone: "987654321" }).phone).toBeTruthy();
    expect(validateAddress({ ...good, phone: "6000000000" })).toEqual({});
  });
  it("pincode: 6 digits, not starting with 0", () => {
    expect(validateAddress({ ...good, pincode: "011001" }).pincode).toBeTruthy();
    expect(validateAddress({ ...good, pincode: "41100" }).pincode).toBeTruthy();
    expect(validateAddress({ ...good, pincode: "4110011" }).pincode).toBeTruthy();
  });
  it("required fields and length limits", () => {
    const errors = validateAddress({ ...good, fullName: " ", city: "", state: "", addressLine1: "" });
    expect(Object.keys(errors).sort()).toEqual(["addressLine1", "city", "fullName", "state"]);
    expect(validateAddress({ ...good, fullName: "a".repeat(101) }).fullName).toBeTruthy();
    expect(validateAddress({ ...good, addressLine2: "a".repeat(201) }).addressLine2).toBeTruthy();
  });
  it("buildShippingAddress trims, fixes the country and leaves out an empty line 2", () => {
    const a = buildShippingAddress({ ...good, fullName: "  Asha Rao ", addressLine2: "  " });
    expect(a.fullName).toBe("Asha Rao");
    expect(a.country).toBe("India");
    expect("addressLine2" in a).toBe(false);
    expect(buildShippingAddress({ ...good, addressLine2: " Flat 2 " }).addressLine2).toBe("Flat 2");
  });
});
