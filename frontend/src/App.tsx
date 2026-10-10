import { BrowserRouter, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar.tsx";
import { Counterfactual } from "./pages/Counterfactual.tsx";
import { Discover } from "./pages/Discover.tsx";
import { Evidence } from "./pages/Evidence.tsx";
import { Friends } from "./pages/Friends.tsx";
import { Home } from "./pages/Home.tsx";
import { MyProfile, Profile } from "./pages/Profile.tsx";
import { WhyThis } from "./pages/WhyThis.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <div className="pb-20 md:pb-0">
        <Routes>
          <Route path="/" element={<Discover />} />
          <Route path="/home" element={<Home />} />
          <Route path="/me" element={<MyProfile />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/why" element={<WhyThis />} />
          <Route path="/counterfactual" element={<Counterfactual />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/evidence" element={<Evidence />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
