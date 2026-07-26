import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App.jsx";

// Note: StrictMode intentionally omitted — its dev double-mount conflicts with
// react-leaflet's map initialization ("Map container is already initialized").
createRoot(document.getElementById("root")).render(<App />);
