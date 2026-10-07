import { timelineLabel, timelineNote } from "../../utils/orderStatus.js";
import { formatDate } from "../../utils/format.js";

// "by" is a user id, "system" or "razorpay": show a friendly word instead of an id
const whoText = (by) => (by === "system" ? "automatic" : by === "razorpay" ? "payment provider" : "");

// The status history, oldest first, as a list with the date, the status and the optional note.
export default function OrderTimeline({ history }) {
  if (!history?.length) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="space-y-4 border-l-2 border-slate-200 pl-4">
      {history.map((entry, i) => {
        const who = whoText(entry.by);
        // the note is left out when it only repeats the title (for example "Payment received" and "payment received")
        const note = timelineNote(entry);
        return (
          <li key={`${entry.status}-${i}`} className="relative">
            <span aria-hidden="true" className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <p className="font-medium text-slate-900">{timelineLabel(entry)}</p>
            <p className="text-xs text-slate-500">
              {formatDate(entry.at)}
              {who && ` · ${who}`}
            </p>
            {note && <p className="mt-0.5 break-words text-sm text-slate-600">{note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
