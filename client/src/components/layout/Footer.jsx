export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} MegaShop</p>
        <p>Prices are in Indian rupees (₹).</p>
      </div>
    </footer>
  );
}
