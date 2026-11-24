import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "@/components/shared/OfflineBanner";
import { useNetworkStore } from "@/stores/network";

// Mock SyncQueuePanel to avoid full hook tree
vi.mock("@/components/shared/SyncQueuePanel", () => ({
  SyncQueuePanel: () => null,
}));

describe("OfflineBanner", () => {
  beforeEach(() => {
    useNetworkStore.setState({ isOnline: true, pendingSyncCount: 0 });
  });

  it("renders nothing when online and no pending items", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows red offline banner when isOnline is false", async () => {
    useNetworkStore.setState({ isOnline: false, pendingSyncCount: 0 });
    render(<OfflineBanner />);
    expect(screen.getByText(/Sin conexión/i)).toBeInTheDocument();
  });

  it("shows pending count when offline with queued items", () => {
    useNetworkStore.setState({ isOnline: false, pendingSyncCount: 3 });
    render(<OfflineBanner />);
    expect(screen.getByText(/3 transacciónes en cola/i)).toBeInTheDocument();
  });

  it("shows syncing banner when online with pending items", () => {
    useNetworkStore.setState({ isOnline: true, pendingSyncCount: 2 });
    render(<OfflineBanner />);
    expect(screen.getByText(/Sincronizando/i)).toBeInTheDocument();
  });
});
