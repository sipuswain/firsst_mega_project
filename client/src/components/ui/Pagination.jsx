import Button from "./Button.jsx";
import { pageList } from "../../utils/pagination.js";

// Previous / numbers / Next. onChange(newPage) is called when the user picks a page.
export default function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      {pageList(page, pages).map((item, i) =>
        item === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400" aria-hidden="true">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "primary" : "ghost"}
            size="sm"
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onChange(item)}
            className="min-w-9"
          >
            {item}
          </Button>
        )
      )}
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
