import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar.tsx";
import { Counterfactual } from "./pages/Counterfactual.tsx";
import { Discover } from "./pages/Discover.tsx";
import { Evidence } from "./pages/Evidence.tsx";
import { Home } from "./pages/Home.tsx";
import { MyProfile, Profile } from "./pages/Profile.tsx";
import { Stats } from "./pages/Stats.tsx";
import { TeaLink } from "./pages/TeaLink.tsx";
import { ShopAccount } from "./pages/shop/ShopAccount.tsx";
import { ShopDemand } from "./pages/shop/ShopDemand.tsx";
import { ShopHome } from "./pages/shop/ShopHome.tsx";
import { ShopLayout } from "./pages/shop/ShopLayout.tsx";
import { ShopMenu } from "./pages/shop/ShopMenu.tsx";
import { ShopOffers } from "./pages/shop/ShopOffers.tsx";
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
          <Route path="/shop" element={<ShopLayout />}>
            <Route index element={<ShopHome />} />
            <Route path="menu" element={<ShopMenu />} />
            <Route path="offers" element={<ShopOffers />} />
            <Route path="demand" element={<ShopDemand />} />
            <Route path="account" element={<ShopAccount />} />
          </Route>
          <Route path="/why" element={<WhyThis />} />
          <Route path="/counterfactual" element={<Counterfactual />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/friends" element={<Navigate to="/discover?scope=people" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
