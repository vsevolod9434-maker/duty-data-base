import { withBasePath } from "./public-path";

export const PHOTO_PLACEHOLDER_PATH = "/no-data-person.png";

export function getPhotoPlaceholderSrc() {
  return withBasePath(PHOTO_PLACEHOLDER_PATH);
}
