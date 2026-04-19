import "./styles/global.css";
import "react-grid-layout/css/styles.css";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./App";
import { DrawerStackProvider } from "./components/ui/DrawerStack";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DrawerStackProvider>
      <RouterProvider router={router} />
    </DrawerStackProvider>
  </StrictMode>,
);
