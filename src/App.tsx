import { Simulator } from "./simulator/Simulator";

export function App() {
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="./">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} />
            <span>Bank of Dad</span>
          </a>
          <span className="badge">Simulator</span>
        </div>
      </header>

      <main className="container">
        <div className="intro">
          <h1>Watch your money make money.</h1>
          <p>
            The Bank of Dad pays interest every month, and next month that interest earns interest too. That's
            compounding. Try a plan below and see how it grows.
          </p>
        </div>
        <Simulator />
      </main>

      <footer className="container site-footer">
        <p>
          Interest is earned every day and paid on the last day of each month. This is a family learning tool, not a
          real bank.
        </p>
      </footer>
    </>
  );
}
