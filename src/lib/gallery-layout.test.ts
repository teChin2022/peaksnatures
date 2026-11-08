import { describe, expect, it } from "vitest";
import { bentoSpans, galleryPhotos } from "@/lib/gallery-layout";

const DESKTOP = [2, 1, 1, 1, 1, 1, 2];
const MOBILE = [2, 1, 1];

describe("bentoSpans", () => {
  it("lays seven photos out as wide + one, three, one + wide on three columns", () => {
    expect(bentoSpans(7, 3, DESKTOP)).toEqual([2, 1, 1, 1, 1, 1, 2]);
  });

  it("stretches the last photo over what its row has left", () => {
    expect(bentoSpans(4, 3, DESKTOP)).toEqual([2, 1, 1, 2]);
    expect(bentoSpans(6, 3, DESKTOP)).toEqual([2, 1, 1, 1, 1, 3]);
  });

  it("gives a single photo the full width", () => {
    expect(bentoSpans(1, 3, DESKTOP)).toEqual([3]);
    expect(bentoSpans(1, 2, MOBILE)).toEqual([2]);
  });

  it("alternates one full-width photo and two halves on two columns", () => {
    expect(bentoSpans(5, 2, MOBILE)).toEqual([2, 1, 1, 2, 2]);
  });

  it("returns nothing for no photos", () => {
    expect(bentoSpans(0, 3, DESKTOP)).toEqual([]);
  });
});

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
