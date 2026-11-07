import { Simulator } from "../simulator/Simulator";

export function SimulatorPage() {
  return (
    <>
      <div className="intro">
        <h1>Watch your money make money.</h1>
        <p>
          The Bank of Dad pays interest every month, and next month that interest earns interest too. That's compounding.
          Try a plan below and see how it grows.
        </p>
      </div>
      <Simulator />
    </>
  );
}
