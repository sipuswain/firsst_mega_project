import { useState } from "react";
import Modal from "./Modal.jsx";
import Input from "../ui/Input.jsx";
import Button from "../ui/Button.jsx";
import ErrorMessage from "../ui/ErrorMessage.jsx";
import { useMutation } from "../../hooks/useMutation.js";
import { createCollectionRequest, renameCollectionRequest } from "../../api/adminCatalog.js";
import { validateCollection } from "../../utils/adminForms.js";

// A small dialog to create a collection (collection = null) or rename one.
// onSaved(message) is called after a successful save; onClose() when the admin cancels.
export default function CollectionFormDialog({ collection, onSaved, onClose }) {
  const { busy, run } = useMutation();
  const [name, setName] = useState(collection?.name ?? "");
  const [error, setError] = useState(""); // a problem found in the browser (shown under the field)
  const [serverError, setServerError] = useState(""); // for example "a collection with this name already exists"
  const [serverSignal, setServerSignal] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    const found = validateCollection({ name });
    setError(found.name ?? "");
    if (found.name) {
      document.getElementById("collection-name")?.focus(); // the focus goes to the invalid field
      return;
    }
    const result = await run(() => (collection ? renameCollectionRequest(collection._id, name.trim()) : createCollectionRequest(name.trim())));
    if (result.skipped) return;
    if (result.ok) {
      onSaved(collection ? "Collection renamed" : "Collection created");
    } else {
      setServerError(result.error.message);
      setServerSignal((n) => n + 1);
    }
  };

  return (
    <Modal title={collection ? "Rename collection" : "New collection"} onClose={onClose} busy={busy}>
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <ErrorMessage message={serverError} focusSignal={serverSignal} />
        <Input id="collection-name" data-autofocus label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={200} disabled={busy} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
