/** Public facade for the feature handlers. Domain implementations live in focused modules. */
export { handlePause, handleResume, handleRenew } from "./subscription-actions.ts"
export { handleReview } from "./review.ts"
export { handleYearly } from "./yearly.ts"
export { handleCheck, handleChanges } from "./diagnostics.ts"
export { handleReceipt } from "./receipt.ts"
export { handleTemplate } from "./templates.ts"
