// "Undo" helper for the orders. We do not use MongoDB transactions, so when a later step fails,
// we undo the earlier steps by hand (put the stock back, decrease the coupon count).
//
// steps = [{ label, run }]   label = text with the order/product ids (used in the log), run = async function
// The steps run from the LAST one to the FIRST one.
// A step that fails is written to the log and NEVER thrown, so the original error is not hidden
// and the other steps still run. Returns how many steps failed.
export const runUndo = async (steps, log = console.error) => {
  let failed = 0;
  for (const step of [...steps].reverse()) {
    try {
      await step.run();
    } catch (err) {
      failed++;
      log(`UNDO FAILED (fix by hand): ${step.label} | reason: ${err?.message ?? err}`);
    }
  }
  return failed;
};
