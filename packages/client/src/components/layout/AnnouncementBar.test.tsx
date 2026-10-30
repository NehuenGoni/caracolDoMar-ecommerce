import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicAnnouncement } from "@/lib/settingsApi";
import { AnnouncementBar } from "./AnnouncementBar";

vi.mock("@/lib/settingsApi", () => ({ getPublicAnnouncement: vi.fn() }));
const mocked = vi.mocked(getPublicAnnouncement);

beforeEach(() => {
  sessionStorage.clear();
  mocked.mockReset();
});

describe("AnnouncementBar", () => {
  it("muestra el aviso vigente", async () => {
    mocked.mockResolvedValue({ announcement: { text: "Jueves feriado" } });
    render(<AnnouncementBar />);
    expect(await screen.findByText("Jueves feriado")).toBeInTheDocument();
  });

  it("sin aviso no muestra nada", async () => {
    mocked.mockResolvedValue({ announcement: null });
    const { container } = render(<AnnouncementBar />);
    await waitFor(() => expect(mocked).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("se cierra y no vuelve en la misma visita, salvo que cambie el texto", async () => {
    mocked.mockResolvedValue({ announcement: { text: "Jueves feriado" } });
    const first = render(<AnnouncementBar />);
    await userEvent.click(await screen.findByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText("Jueves feriado")).not.toBeInTheDocument();
    first.unmount();

    render(<AnnouncementBar />);
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Jueves feriado")).not.toBeInTheDocument();

    mocked.mockResolvedValue({ announcement: { text: "Nuevo horario de verano" } });
    render(<AnnouncementBar />);
    expect(await screen.findByText("Nuevo horario de verano")).toBeInTheDocument();
  });
});
