declare module "*.css";

export {};

/* React's types omit `referrerPolicy` on <video> (MediaHTMLAttributes),
   but browsers support it and the site needs it: the video storage
   host refuses a request whose Referer names another site (403), so
   the native player must send no Referer at all. Augment the type so
   the attribute can be set declaratively in JSX — it has to be on the
   element before `src` is applied, so setting it later from a ref
   callback is too late (the fetch already started with the page's
   Referer and the player fell back to the source iframe). */
declare global {
  namespace React {
    interface VideoHTMLAttributes<T> extends MediaHTMLAttributes<T> {
      referrerPolicy?:
        | "no-referrer"
        | "no-referrer-when-downgrade"
        | "origin"
        | "origin-when-cross-origin"
        | "same-origin"
        | "strict-origin"
        | "strict-origin-when-cross-origin"
        | "unsafe-url"
        | undefined;
    }
  }
}
