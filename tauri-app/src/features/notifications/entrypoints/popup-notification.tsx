import "../../../styles/globals.css";
import { createRoot } from "react-dom/client";
import { PopupNotificationView } from "../views/PopupNotificationView";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<PopupNotificationView />);
}
