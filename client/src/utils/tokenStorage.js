// The login token is kept in localStorage.
// Trade-off: it survives a page reload and a closed tab (simple), but any JavaScript on the page can read it,
// so a cross-site scripting (XSS) bug could steal it. That is why this app never uses dangerouslySetInnerHTML
// and never prints the token. The safer (but more work) choice is an httpOnly cookie set by the backend.
const KEY = "megashop_token";

export const getToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage can be blocked (private mode): then the user simply has to log in again
  }
};
export const saveToken = (token) => {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // ignore: the user stays logged in until the page is closed
  }
};
export const clearToken = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
