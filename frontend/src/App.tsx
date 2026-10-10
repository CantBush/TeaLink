import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar.tsx";
import { Counterfactual } from "./pages/Counterfactual.tsx";
import { Discover } from "./pages/Discover.tsx";
import { Evidence } from "./pages/Evidence.tsx";
import { Home } from "./pages/Home.tsx";
import { MyProfile, Profile } from "./pages/Profile.tsx";
import { Stats } from "./pages/Stats.tsx";
import { TeaLink } from "./pages/TeaLink.tsx";
import { Welcome } from "./pages/Welcome.tsx";
import { WhyThis } from "./pages/WhyThis.tsx";

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <div className="pb-24 md:pb-0">
        <Routes>
          <Route path="/" element={<TeaLink />} />
          <Route path="/home" element={<Home />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/me" element={<MyProfile />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/why" element={<WhyThis />} />
          <Route path="/counterfactual" element={<Counterfactual />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/friends" element={<Navigate to="/discover?scope=people" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
