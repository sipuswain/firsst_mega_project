import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartContext } from "./cartContext.js";
import { useAuth } from "../hooks/useAuth.js";
import {
  addCartItemRequest, clearCartRequest, couponPreviewRequest, getCartRequest, removeCartItemRequest, setCartQuantityRequest,
} from "../api/cart.js";

const EMPTY = { userId: null, items: [], subtotal: 0, ready: false, error: null };

// The cart of the logged in user. The SERVER is the only source of prices and totals: this only keeps
// what the server answered, and shows it. A visitor who is not logged in has no cart.
//
// state.userId says whose cart the state is. If the user logs out or another user logs in, the old cart is
// simply ignored (see "mine" below), so a cart of the previous user can never be shown.
export function CartProvider({ children }) {
  const { user } = useAuth();
  const userId = user?._id ?? null;

  const [state, setState] = useState(EMPTY);
  const [busyCount, setBusyCount] = useState(0); // > 0 while a request runs (controls are disabled)
  // the coupon preview from the server: { code, discount, total, subtotal, discountType, discountValue } or null
  const [coupon, setCoupon] = useState(null);

  const mine = state.userId === userId && userId !== null;
  const items = useMemo(() => (mine ? state.items : []), [mine, state.items]);
  const subtotal = mine ? state.subtotal : 0;
  const ready = mine && state.ready;

  // keep the newest user id for the async functions below
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  });

  const save = useCallback((forUser, cart) => {
    if (userIdRef.current !== forUser) return; // the user changed while the request was running: ignore the answer
    setState({ userId: forUser, items: cart.items ?? [], subtotal: cart.subtotal ?? 0, ready: true, error: null });
  }, []);

  // load the cart when a user is logged in (and again for a different user)
  const [reloadCount, setReloadCount] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    getCartRequest(controller.signal)
      .then((data) => save(userId, data.cart))
      .catch((err) => {
        if (err?.name === "AbortError" || userIdRef.current !== userId) return;
        setState({ userId, items: [], subtotal: 0, ready: true, error: err.message });
      });
    return () => controller.abort();
  }, [userId, reloadCount, save]);

  // After every change the totals change, so a coupon preview is asked again (and dropped if it is not valid any more)
  const refreshCoupon = useCallback(async (code) => {
    if (!code) return;
    try {
      const data = await couponPreviewRequest(code);
      setCoupon({ ...data.coupon, subtotal: data.subtotal, discount: data.discount, total: data.total });
    } catch {
      setCoupon(null);
    }
  }, []);

  // Runs one request: counts it as "busy", saves the new cart. Errors go to the caller (to show the message).
  const run = useCallback(
    async (request) => {
      const forUser = userIdRef.current;
      setBusyCount((n) => n + 1);
      try {
        const data = await request();
        save(forUser, data.cart);
        return data.cart;
      } finally {
        setBusyCount((n) => n - 1);
      }
    },
    [save]
  );

  const couponCode = coupon?.code ?? null;
  const afterChange = useCallback(
    async (request) => {
      const cart = await run(request);
      if (couponCode) await refreshCoupon(couponCode);
      return cart;
    },
    [run, refreshCoupon, couponCode]
  );

  const add = useCallback((productId, quantity) => afterChange(() => addCartItemRequest(productId, quantity)), [afterChange]);
  const setQuantity = useCallback((productId, quantity) => afterChange(() => setCartQuantityRequest(productId, quantity)), [afterChange]);
  const remove = useCallback((productId) => afterChange(() => removeCartItemRequest(productId)), [afterChange]);
  const clear = useCallback(async () => {
    const cart = await run(clearCartRequest);
    setCoupon(null);
    return cart;
  }, [run]);

  // Asks the server for the discount (nothing is saved on the server; the coupon is used when the order is placed)
  const previewCoupon = useCallback(async (code) => {
    setBusyCount((n) => n + 1);
    try {
      const data = await couponPreviewRequest(code);
      setCoupon({ ...data.coupon, subtotal: data.subtotal, discount: data.discount, total: data.total });
    } finally {
      setBusyCount((n) => n - 1);
    }
  }, []);
  const removeCoupon = useCallback(() => setCoupon(null), []);

  // Load the cart again from the server (for example after an order was placed: the server emptied it)
  const refresh = useCallback(() => {
    setCoupon(null);
    setReloadCount((n) => n + 1);
  }, []);

  // the coupon belongs to the cart of one user
  const shownCoupon = mine ? coupon : null;

  const value = useMemo(() => {
    const availableCount = items.filter((i) => i.available).length;
    return {
      items,
      subtotal,
      ready,
      error: mine ? state.error : null,
      count: items.reduce((sum, i) => sum + (i.quantity ?? 0), 0),
      availableCount,
      hasUnavailable: availableCount < items.length,
      busy: busyCount > 0,
      coupon: shownCoupon,
      add, setQuantity, remove, clear, previewCoupon, removeCoupon, refresh,
    };
  }, [items, subtotal, ready, mine, state.error, busyCount, shownCoupon, add, setQuantity, remove, clear, previewCoupon, removeCoupon, refresh]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
