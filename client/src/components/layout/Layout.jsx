import { Outlet } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import RouteNotice from "./RouteNotice.jsx";

// The frame around every page: header, the page itself (<Outlet />), footer.
// "Skip to content" is the first thing a keyboard user reaches.
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <RouteNotice />
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
