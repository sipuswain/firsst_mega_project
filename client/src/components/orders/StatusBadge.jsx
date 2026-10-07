import Badge from "../ui/Badge.jsx";
import { statusInfo } from "../../utils/orderStatus.js";

// The coloured label of an ORDER status ("Shipped"). The label and colour come from utils/orderStatus.js.
export default function StatusBadge({ status }) {
  const info = statusInfo(status);
  return <Badge tone={info.tone}>{info.label}</Badge>;
}
