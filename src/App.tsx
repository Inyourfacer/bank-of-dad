import { useEffect } from "react";
import { AppProvider, useApp } from "./data/AppContext";
import { enterDemo, exitDemo } from "./data/backend";
import { match, navigate, useRoute } from "./lib/router";
import { DevicePage } from "./pages/DevicePage";
import { FamilyPage } from "./pages/FamilyPage";
import { FamilySettingsPage } from "./pages/FamilySettingsPage";
import { KidPage } from "./pages/KidPage";
import { SetupFamilyPage } from "./pages/SetupFamilyPage";
import { SignInPage } from "./pages/SignInPage";
import { SimulatorPage } from "./pages/SimulatorPage";

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { api, status, data } = useApp();
  const signedIn = status === "ready" || status === "no-family";
  const onSimulator = route === "/";

  useEffect(() => {
    if (route === "/demo") enterDemo();
  }, [route]);

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="#/">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} />
            <span>Bank of Dad</span>
          </a>
          <nav className="nav" aria-label="Main">
            <a href="#/" aria-current={onSimulator ? "page" : undefined}>
              Simulator
            </a>
            <a href="#/family" aria-current={!onSimulator ? "page" : undefined}>
              {data?.me.role === "device" ? "Kids" : "Family"}
            </a>
            {api?.kind === "demo" && (
              <button type="button" className="badge" onClick={exitDemo} title="Leave the demo">
                Demo · exit
              </button>
            )}
            {signedIn && (
              <button type="button" className="nav-button" onClick={() => void api?.signOut().then(() => navigate("/"))}>
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="container main">
        <Routes route={route} />
      </main>

      <footer className="container site-footer">
        <p>
          Interest is earned every day and paid on the last day of each month. This is a family learning tool, not a real
          bank.
        </p>
      </footer>
    </>
  );
}

function Routes({ route }: { route: string }) {
  const { status, data, error } = useApp();

  if (route === "/") return <SimulatorPage />;

  if (status === "loading") return <p className="muted center pad">Loading…</p>;
  if (status === "error") {
    return (
      <div className="narrow">
        <div className="panel stack">
          <h1 className="page-title">Something went wrong</h1>
          <p className="error-msg">{error}</p>
        </div>
      </div>
    );
  }
  if (status === "unconfigured" || status === "signed-out") return <SignInPage />;
  if (status === "no-family") return <SetupFamilyPage />;
  if (!data) return null;

  if (data.me.role === "device") return <DevicePage />;

  const kid = match("/family/kid/:id", route);
  if (kid) return <KidPage kidId={kid.id} />;
  if (route === "/family/settings") return <FamilySettingsPage />;
  return <FamilyPage />;
}
