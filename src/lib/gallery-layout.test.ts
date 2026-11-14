import { describe, expect, it } from "vitest";
import { galleryPhotos } from "@/lib/gallery-layout";

describe("galleryPhotos", () => {
  it("weaves the gallery with each house's first photo, then the houses' other photos", () => {
    expect(galleryPhotos(["g1", "g2", "g3"], [["a1", "a2"], ["b1"]])).toEqual(["g1", "a1", "g2", "b1", "g3", "a2"]);
  });

  it("shows house photos alone when the gallery is empty", () => {
    expect(galleryPhotos([], [["a1", "a2"]])).toEqual(["a1", "a2"]);
  });

  it("skips houses without photos and shows a repeated photo once", () => {
    expect(galleryPhotos(["x", "y"], [[], ["x", "z"]])).toEqual(["x", "y", "z"]);
  });
});
