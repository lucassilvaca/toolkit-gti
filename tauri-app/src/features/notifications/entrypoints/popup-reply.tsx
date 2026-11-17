import "../../../styles/globals.css";
import { createRoot } from "react-dom/client";
import { PopupReplyView } from "../views/PopupReplyView";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<PopupReplyView />);
}
