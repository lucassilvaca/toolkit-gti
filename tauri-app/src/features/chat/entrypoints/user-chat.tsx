import "../../../styles/globals.css";
import { createRoot } from "react-dom/client";
import { UserChatView } from "../views/UserChatView";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<UserChatView />);
}
