import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../hooks/useApi.js";
import { useMutation } from "../../hooks/useMutation.js";
import { useToast } from "../../hooks/useToast.js";
import { listCollections } from "../../api/products.js";
import { deleteCollectionRequest } from "../../api/adminCatalog.js";
import PageHeading from "../../components/admin/PageHeading.jsx";
import DataTable from "../../components/admin/DataTable.jsx";
import ConfirmDialog from "../../components/admin/ConfirmDialog.jsx";
import CollectionFormDialog from "../../components/admin/CollectionFormDialog.jsx";
import Button from "../../components/ui/Button.jsx";
import { formatDate } from "../../utils/format.js";

// Collections: create, rename, delete. The backend refuses to delete a collection that still has products: its message is shown.
export default function AdminCollectionsPage() {
  const toast = useToast();
  const { busy, run } = useMutation();
  const collections = useApi((signal) => listCollections(signal), []);
  // which dialog is open: { type: "create" } | { type: "rename", collection } | { type: "delete", collection }
  const [dialog, setDialog] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const saved = (message) => {
    toast.success(message);
    setDialog(null);
    collections.reload();
  };

  const confirmDelete = async () => {
    setDeleteError("");
    const result = await run(() => deleteCollectionRequest(dialog.collection._id));
    if (result.skipped) return;
    if (result.ok) saved("Collection deleted");
    else setDeleteError(result.error.message); // for example "Cannot delete this collection: 2 product(s) still belong to it..."
  };

  const columns = [
    { key: "name", header: "Name", className: "break-words font-medium", render: (c) => c.name },
    { key: "created", header: "Created", className: "whitespace-nowrap", render: (c) => formatDate(c.createdAt) },
    {
      key: "actions",
      header: "Actions",
      className: "whitespace-nowrap",
      render: (c) => (
        <div className="flex flex-wrap gap-2">
          <Link to={`/admin/products?collectionId=${c._id}`} aria-label={`Products in ${c.name}`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
            Products
          </Link>
          <Button variant="secondary" size="sm" aria-label={`Rename ${c.name}`} onClick={() => setDialog({ type: "rename", collection: c })}>
            Rename
          </Button>
          <Button variant="secondary" size="sm" aria-label={`Delete ${c.name}`} onClick={() => { setDeleteError(""); setDialog({ type: "delete", collection: c }); }}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeading title="Collections" subtitle="Groups of products, like categories" action={<Button onClick={() => setDialog({ type: "create" })}>New collection</Button>} />

      <DataTable
        caption="Collections"
        columns={columns}
        rows={collections.data?.collections}
        getKey={(c) => c._id}
        loading={collections.loading}
        error={collections.error}
        onRetry={collections.reload}
        emptyTitle="No collections yet"
        emptyText="Every product belongs to a collection, so create one first."
        emptyAction={<Button onClick={() => setDialog({ type: "create" })}>New collection</Button>}
      />

      {(dialog?.type === "create" || dialog?.type === "rename") && (
        <CollectionFormDialog collection={dialog.type === "rename" ? dialog.collection : null} onSaved={saved} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog title="Delete this collection?" confirmLabel="Delete collection" busyLabel="Deleting..." danger busy={busy} error={deleteError} onConfirm={confirmDelete} onCancel={() => setDialog(null)}>
          <p className="break-words">
            <strong>{dialog.collection.name}</strong> will be deleted. This only works when no product belongs to it.
          </p>
          {deleteError && (
            <p>
              <Link to={`/admin/products?collectionId=${dialog.collection._id}`} className="font-medium text-indigo-700 underline">
                See the products in this collection
              </Link>
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
