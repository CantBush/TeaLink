import { BrowserRouter, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar.tsx";
import { Counterfactual } from "./pages/Counterfactual.tsx";
import { Discover } from "./pages/Discover.tsx";
import { Friends } from "./pages/Friends.tsx";
import { WhyThis } from "./pages/WhyThis.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<Discover />} />
        <Route path="/why" element={<WhyThis />} />
        <Route path="/counterfactual" element={<Counterfactual />} />
        <Route path="/friends" element={<Friends />} />
      </Routes>
    </BrowserRouter>
  );
}
