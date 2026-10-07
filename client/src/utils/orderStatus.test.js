import { describe, expect, it } from "vitest";
import { adminActions, orderActions, paymentInfo, paymentMethodLabel, statusInfo, timelineLabel, timelineNote, PENDING_PAYMENT_REASON } from "./orderStatus.js";

describe("statusInfo", () => {
  it("gives a label and a colour for every order status", () => {
    expect(statusInfo("PLACED")).toEqual({ label: "Order placed", tone: "blue" });
    expect(statusInfo("CONFIRMED").tone).toBe("indigo");
    expect(statusInfo("SHIPPED").tone).toBe("amber");
    expect(statusInfo("DELIVERED").tone).toBe("green");
    expect(statusInfo("CANCELLED").tone).toBe("red");
  });
  it("does not break on an unknown status", () => {
    expect(statusInfo("WEIRD")).toEqual({ label: "WEIRD", tone: "gray" });
    expect(statusInfo(undefined).label).toBe("Unknown");
  });
});

describe("paymentMethodLabel", () => {
  it("names both methods", () => {
    expect(paymentMethodLabel("ONLINE")).toBe("Online (Razorpay)");
    expect(paymentMethodLabel("COD")).toBe("Cash on delivery");
  });
});

describe("paymentInfo", () => {
  it("maps the payment statuses", () => {
    expect(paymentInfo({ paymentStatus: "PAID" })).toEqual({ label: "Paid", tone: "green" });
    expect(paymentInfo({ paymentStatus: "REFUNDED" }).label).toBe("Refunded");
    expect(paymentInfo({ paymentStatus: "FAILED" }).tone).toBe("red");
  });
  it("PENDING depends on the method and on a cancelled order", () => {
    expect(paymentInfo({ paymentMethod: "COD", paymentStatus: "PENDING", status: "PLACED" }).label).toBe("Pay on delivery");
    expect(paymentInfo({ paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "PLACED" }).label).toBe("Payment pending");
    expect(paymentInfo({ paymentMethod: "ONLINE", paymentStatus: "PENDING", status: "CANCELLED" }).label).toBe("Not paid");
    expect(paymentInfo({ paymentMethod: "COD", paymentStatus: "PENDING", status: "CANCELLED" }).label).toBe("Not paid");
  });
});

describe("orderActions: which buttons show", () => {
  const act = (paymentMethod, paymentStatus, status) => orderActions({ paymentMethod, paymentStatus, status });

  it("Pay now only for ONLINE + PENDING + PLACED", () => {
    expect(act("ONLINE", "PENDING", "PLACED").canPay).toBe(true);
    expect(act("ONLINE", "PENDING", "CONFIRMED").canPay).toBe(false);
    expect(act("ONLINE", "PENDING", "CANCELLED").canPay).toBe(false);
    expect(act("ONLINE", "PAID", "PLACED").canPay).toBe(false);
    expect(act("ONLINE", "FAILED", "PLACED").canPay).toBe(false);
    expect(act("COD", "PENDING", "PLACED").canPay).toBe(false);
  });
  it("Cancel only for PLACED / CONFIRMED", () => {
    expect(act("COD", "PENDING", "PLACED").canCancel).toBe(true);
    expect(act("COD", "PENDING", "CONFIRMED").canCancel).toBe(true);
    expect(act("COD", "PENDING", "SHIPPED").canCancel).toBe(false);
    expect(act("COD", "PENDING", "DELIVERED").canCancel).toBe(false);
    expect(act("COD", "PENDING", "CANCELLED").canCancel).toBe(false);
    expect(act("ONLINE", "PENDING", "PLACED").canCancel).toBe(true);
  });
  it("a PAID online order cannot be cancelled: contact support instead", () => {
    const paid = act("ONLINE", "PAID", "PLACED");
    expect(paid.canCancel).toBe(false);
    expect(paid.contactSupport).toBe(true);
    expect(act("ONLINE", "PAID", "SHIPPED").contactSupport).toBe(false);
  });
  it("handles a missing order", () => {
    expect(orderActions(undefined)).toEqual({ canPay: false, canCancel: false, contactSupport: false });
  });
});

describe("adminActions: which buttons the admin gets", () => {
  const act = (paymentMethod, paymentStatus, status) => adminActions({ paymentMethod, paymentStatus, status });

  it("COD: PLACED -> CONFIRMED -> SHIPPED -> DELIVERED, one step at a time", () => {
    expect(act("COD", "PENDING", "PLACED").forward).toEqual({ to: "CONFIRMED", label: "Confirm order", blockedReason: null });
    expect(act("COD", "PENDING", "CONFIRMED").forward.to).toBe("SHIPPED");
    expect(act("COD", "PENDING", "SHIPPED").forward.to).toBe("DELIVERED");
  });
  it("DELIVERED and CANCELLED are the end: no buttons at all", () => {
    for (const status of ["DELIVERED", "CANCELLED"]) {
      expect(act("COD", "PAID", status)).toEqual({ forward: null, canCancel: false, refundOnCancel: false });
    }
  });
  it("cancel only while PLACED or CONFIRMED", () => {
    expect(act("COD", "PENDING", "PLACED").canCancel).toBe(true);
    expect(act("COD", "PENDING", "CONFIRMED").canCancel).toBe(true);
    expect(act("COD", "PENDING", "SHIPPED").canCancel).toBe(false);
    expect(act("COD", "PAID", "DELIVERED").canCancel).toBe(false);
  });
  it("an ONLINE order that is not PAID cannot move forward (with a reason), but can be cancelled", () => {
    for (const paymentStatus of ["PENDING", "FAILED"]) {
      const a = act("ONLINE", paymentStatus, "PLACED");
      expect(a.forward.to).toBe("CONFIRMED");
      expect(a.forward.blockedReason).toBe(PENDING_PAYMENT_REASON);
      expect(a.canCancel).toBe(true);
      expect(a.refundOnCancel).toBe(false);
    }
  });
  it("a PAID ONLINE order can move forward, and cancelling it means a full refund", () => {
    const a = act("ONLINE", "PAID", "PLACED");
    expect(a.forward.blockedReason).toBeNull();
    expect(a.canCancel).toBe(true);
    expect(a.refundOnCancel).toBe(true);
    expect(act("ONLINE", "PAID", "CONFIRMED").refundOnCancel).toBe(true);
    expect(act("ONLINE", "PAID", "SHIPPED")).toMatchObject({ canCancel: false, refundOnCancel: false });
  });
  it("a COD order never asks for a refund", () => {
    expect(act("COD", "PENDING", "PLACED").refundOnCancel).toBe(false);
  });
  it("handles a missing order", () => {
    expect(adminActions(undefined)).toEqual({ forward: null, canCancel: false, refundOnCancel: false });
  });
});

describe("timelineLabel", () => {
  it("a payment note is shown as \"Payment received\", not as a second \"Order placed\"", () => {
    expect(timelineLabel({ status: "PLACED", note: "payment received" })).toBe("Payment received");
  });
  it("normal entries use the status label", () => {
    expect(timelineLabel({ status: "PLACED" })).toBe("Order placed");
    expect(timelineLabel({ status: "CANCELLED", note: "expired: not paid in time" })).toBe("Cancelled");
    expect(timelineLabel({ status: "SHIPPED" })).toBe("Shipped");
  });
});

describe("timelineNote", () => {
  it("a note that is the same as the title (any upper/lower case) is not shown a second time", () => {
    expect(timelineNote({ status: "PLACED", note: "payment received" })).toBe(""); // title "Payment received"
    expect(timelineNote({ status: "SHIPPED", note: "sHiPpEd" })).toBe(""); // title "Shipped"
    expect(timelineNote({ status: "CANCELLED", note: "CANCELLED" })).toBe(""); // title "Cancelled"
    expect(timelineNote({ status: "PLACED", note: "  order placed " })).toBe(""); // title "Order placed"
  });
  it("a different note is shown as it is", () => {
    expect(timelineNote({ status: "CANCELLED", note: "expired: not paid in time" })).toBe("expired: not paid in time");
    expect(timelineNote({ status: "PLACED", note: "Payment received twice" })).toBe("Payment received twice");
  });
  it("no note (or a bad one) gives an empty text", () => {
    expect(timelineNote({ status: "PLACED" })).toBe("");
    expect(timelineNote({ status: "PLACED", note: null })).toBe("");
    expect(timelineNote(undefined)).toBe("");
  });
});
