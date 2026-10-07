import Badge from "../ui/Badge.jsx";
import { paymentInfo } from "../../utils/orderStatus.js";

// The coloured label of the PAYMENT of an order ("Paid", "Payment pending" ...). order = { paymentMethod, paymentStatus, status }
export default function PaymentBadge({ order }) {
  const info = paymentInfo(order);
  return <Badge tone={info.tone}>{info.label}</Badge>;
}
