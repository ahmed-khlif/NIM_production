import { describe, expect, it, vi } from "vitest";
import { getCurrentUser, loginRequest } from "@/features/auth/auth-client";

describe("auth client", () => {
  it("sends credentials for login and returns the user", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ user: { username: "admin" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loginRequest({ username: "admin", password: "NimAdmin!2026" })).resolves.toEqual({ user: { username: "admin" } });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/auth/login", expect.objectContaining({ credentials: "include", method: "POST" }));
  });

  it("maps API errors to a stable ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "INVALID_CREDENTIALS", message: "Invalid" }), { status: 401 })));

    await expect(getCurrentUser()).rejects.toEqual(expect.objectContaining({ code: "INVALID_CREDENTIALS", status: 401 }));
  });

  it("blocks write requests while offline instead of queueing them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const originalOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    await expect(loginRequest({ username: "admin", password: "secret" })).rejects.toEqual(expect.objectContaining({ code: "OFFLINE", status: 0 }));
    expect(fetchMock).not.toHaveBeenCalled();

    if (originalOnline) Object.defineProperty(window.navigator, "onLine", originalOnline);
    else Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });
});
