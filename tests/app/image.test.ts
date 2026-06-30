import { afterEach, describe, expect, it, vi } from "vitest";
import { loadImage, resizeImageFile } from "../../src/app/image";

type ImageMode = "load" | "error";

function installImage(mode: ImageMode, width = 1000, height = 500) {
  class TestImage extends EventTarget {
    naturalWidth = width;
    naturalHeight = height;
    set src(_value: string) {
      queueMicrotask(() => this.dispatchEvent(new Event(mode)));
    }
  }
  globalThis.Image = TestImage as unknown as typeof Image;
}

afterEach(() => vi.restoreAllMocks());

describe("button image processing", () => {
  it("decodes, scales, draws, and encodes a large image", async () => {
    installImage("load");
    const create = vi.fn(() => "blob:file");
    const revoke = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: create },
      revokeObjectURL: { configurable: true, value: revoke },
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/webp;base64,test");

    const result = await resizeImageFile(new File(["x"], "image.png", { type: "image/png" }), 512);
    expect(result).toBe("data:image/webp;base64,test");
    const canvas = document.querySelector("canvas");
    // The canvas is not attached, so verify dimensions through the draw call.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 512, 256);
    expect(revoke).toHaveBeenCalledWith("blob:file");
    expect(create).toHaveBeenCalledOnce();
    expect(canvas).toBeNull();
  });

  it("does not enlarge small images and enforces a minimum canvas size", async () => {
    installImage("load", 0, 0);
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: vi.fn(() => "blob:zero") },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:test");
    await resizeImageFile(new File(["x"], "zero.png", { type: "image/png" }), 512);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1, 1);
  });

  it("rejects decode failures and revokes the object URL", async () => {
    installImage("error");
    const revoke = vi.fn();
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: vi.fn(() => "blob:bad") },
      revokeObjectURL: { configurable: true, value: revoke },
    });
    await expect(loadImage(new File(["bad"], "bad.png", { type: "image/png" })))
      .rejects.toThrow("could not be decoded");
    expect(revoke).toHaveBeenCalledWith("blob:bad");
  });

  it("reports missing canvas support", async () => {
    installImage("load", 10, 10);
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: vi.fn(() => "blob:file") },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(resizeImageFile(new File(["x"], "image.png", { type: "image/png" }), 512))
      .rejects.toThrow("not supported");
  });
});
