import assert from "node:assert/strict";
import test from "node:test";
import {
  isUsableImageWidth,
  MIN_IMAGE_WIDTH,
  pickFeaturedIndex,
  publisherInitial,
  safeImageUrl,
} from "../lib/article-images.mjs";

const image = "https://cdn.example.com/lead.jpg";

test("accepts only public HTTPS image addresses", () => {
  assert.equal(safeImageUrl(image), image);
  assert.equal(safeImageUrl(`  ${image}  `), image);
  for (const invalid of [
    undefined, null, 42, "", "not a url", "http://cdn.example.com/a.jpg",
    "javascript:alert(1)", "data:image/png;base64,AAAA",
    "https://user:pass@cdn.example.com/a.jpg", `https://cdn.example.com/${"a".repeat(2_000)}`,
  ]) assert.equal(safeImageUrl(invalid), null);
});

test("featured slot prefers the newest story with an image among the latest four", () => {
  const story = (imageUrl) => ({ image_url: imageUrl });
  assert.equal(pickFeaturedIndex([story(image), story(null)]), 0);
  assert.equal(pickFeaturedIndex([story(null), story("http://x.com/a.jpg"), story(image), story(image)]), 2);
  assert.equal(pickFeaturedIndex([story(null), story(null), story(null), story(null), story(image)]), 0);
  assert.equal(pickFeaturedIndex([]), 0);
  assert.equal(pickFeaturedIndex([null, story(image)]), 1);
});

test("small logo-sized images are treated as missing", () => {
  assert.equal(isUsableImageWidth(MIN_IMAGE_WIDTH), true);
  assert.equal(isUsableImageWidth(1200), true);
  for (const width of [0, 120, MIN_IMAGE_WIDTH - 1, Number.NaN, undefined]) {
    assert.equal(isUsableImageWidth(width), false);
  }
});

test("placeholder initial comes from the publisher name", () => {
  assert.equal(publisherInitial("www.arabnews.com"), "A");
  assert.equal(publisherInitial("  Gulf News "), "G");
  assert.equal(publisherInitial("www.123health.com"), "1");
  for (const missing of [null, undefined, "", "   ", "---"]) assert.equal(publisherInitial(missing), null);
});
