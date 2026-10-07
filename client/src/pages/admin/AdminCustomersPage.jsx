import { useSearchParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { listCustomersRequest } from "../../api/admin.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import DataTable from "../../components/admin/DataTable.jsx";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import { buildCustomerQuery, readCustomerFilters } from "../../utils/adminQuery.js";
import { applyFilterChange } from "../../utils/query.js";
import { formatDate } from "../../utils/format.js";

// The customers (read only): name, email, role, joined date. Search by name or email, with pages.
// The server never sends passwords or reset tokens.
export default function AdminCustomersPage() {
  const [params, setParams] = useSearchParams();
  const filters = readCustomerFilters(params);
  const users = useApi((signal) => listCustomersRequest(buildCustomerQuery(filters), signal), [filters.search, filters.page]);
  const change = (patch) => setParams(applyFilterChange(params, patch));

  const columns = [
    { key: "name", header: "Name", className: "break-words font-medium", render: (u) => u.name },
    { key: "email", header: "Email", className: "break-all", render: (u) => u.email },
    { key: "role", header: "Role", render: (u) => <Badge tone={u.role === "ADMIN" ? "indigo" : "gray"}>{u.role}</Badge> },
    { key: "joined", header: "Joined", className: "whitespace-nowrap", render: (u) => formatDate(u.createdAt) },
  ];

  return (
    <div>
      <PageHeading title="Customers" subtitle={users.data ? `${users.data.total} ${users.data.total === 1 ? "person" : "people"}` : undefined} />

      <form
        role="search"
        key={filters.search}
        onSubmit={(e) => {
          e.preventDefault();
          change({ search: new FormData(e.currentTarget).get("search").trim() });
        }}
        className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4"
      >
        <Input name="search" label="Search by name or email" defaultValue={filters.search} maxLength={100} className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {filters.search && (
          <Button variant="ghost" onClick={() => setParams({})}>
            Clear
          </Button>
        )}
      </form>

      <DataTable
        caption="Customers"
        columns={columns}
        rows={users.data?.users}
        getKey={(u) => u._id}
        loading={users.loading}
        error={users.error}
        onRetry={users.reload}
        emptyTitle={filters.search ? "Nobody matches your search" : "No customers yet"}
        emptyText={filters.search ? "Try a different name or email." : "People who sign up will show up here."}
        page={users.data?.page}
        pages={users.data?.pages}
        onPageChange={(page) => change({ page })}
      />
    </div>
  );
}
