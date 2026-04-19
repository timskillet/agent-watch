import { describe, it, expect, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useState } from "react";
import { DrawerStackProvider, useDrawerStackRegister } from "./DrawerStack";

afterEach(() => {
  cleanup();
});

function Registrant({
  open,
  onStateChange,
}: {
  open: boolean;
  onStateChange: (isTop: boolean) => void;
}) {
  const { isTop } = useDrawerStackRegister(open);
  useEffect(() => {
    onStateChange(isTop);
  }, [isTop, onStateChange]);
  return null;
}

describe("useDrawerStackRegister", () => {
  it("a single registered drawer is top", () => {
    const calls: boolean[] = [];
    render(
      <DrawerStackProvider>
        <Registrant open onStateChange={(t) => calls.push(t)} />
      </DrawerStackProvider>,
    );
    expect(calls[calls.length - 1]).toBe(true);
  });

  it("when two drawers register, only the second is top", () => {
    const calls: Array<{ who: string; top: boolean }> = [];
    function Harness() {
      return (
        <DrawerStackProvider>
          <Registrant
            open
            onStateChange={(t) => calls.push({ who: "A", top: t })}
          />
          <Registrant
            open
            onStateChange={(t) => calls.push({ who: "B", top: t })}
          />
        </DrawerStackProvider>
      );
    }
    render(<Harness />);

    const latestA = [...calls].reverse().find((c) => c.who === "A");
    const latestB = [...calls].reverse().find((c) => c.who === "B");
    expect(latestA?.top).toBe(false);
    expect(latestB?.top).toBe(true);
  });

  it("when the top drawer unregisters, underneath drawer becomes top", () => {
    const calls: Array<{ who: string; top: boolean }> = [];
    function Harness() {
      const [showB, setShowB] = useState(true);
      return (
        <DrawerStackProvider>
          <Registrant
            open
            onStateChange={(t) => calls.push({ who: "A", top: t })}
          />
          {showB && (
            <Registrant
              open
              onStateChange={(t) => calls.push({ who: "B", top: t })}
            />
          )}
          <button data-testid="drop-b" onClick={() => setShowB(false)}>
            drop
          </button>
        </DrawerStackProvider>
      );
    }
    const { getByTestId } = render(<Harness />);
    act(() => {
      getByTestId("drop-b").click();
    });
    const latestA = [...calls].reverse().find((c) => c.who === "A");
    expect(latestA?.top).toBe(true);
  });

  it("degrades to 'always top' when no provider wraps the tree", () => {
    const calls: boolean[] = [];
    render(<Registrant open onStateChange={(t) => calls.push(t)} />);
    expect(calls[calls.length - 1]).toBe(true);
  });
});
