# Packet P7b — Chrome fade: mask the background layer, never the content

Work in `/home/system/workspaces/LAL/Development/bb-plugins/liquid-glass`
(installed, active). Read `packet-P7-chrome-fade.md` and P7's report in your
prompt appendix, then brief §5 (Preservation rule).

## Defect (user screenshot, 2026-09-02 23:40)

`/home/system/.bb/thread-storage/thr_3uy6dx4vfp/Attachments/image-1788405196682-cwkkru.png` (view it).
With P7 live, the composer dock's *content* is being masked: the bottom
footer row (project, machine, "Approve for me") is faded to near-invisible,
the composer card's bottom edge is clipped, and the fade sits on the wrong
edge of the dock. The `mask-image` (and possibly the gradient background)
was applied to the dock container itself, so its children fade with it.

## Second defect (user, 2026-09-02 23:50)

"The composer box is scrolling with the thread instead of shrinking or staying
at the bottom." The dock must stay pinned; the host positions it (sticky or
flex-anchored) and P7's rules broke that, almost certainly by declaring
`position`, `isolation`, `overflow`, `contain`, `display`, `height`, or
`transform` on the dock root or its ancestors.

## Host facts (read before designing)

The composer dock is the host's `bottom-anchored-scroll-body` footer:
`className="sticky bottom-0 z-20 shrink-0 [overflow-anchor:none]"` inside the
transcript's scroll container (`apps/app/src/components/ui/bottom-anchored-scroll-body.tsx` ~946).
Sticky positioning is fragile: a pseudo-element with `position: absolute;
inset: 0` plus `isolation: isolate` on that footer, as P7 shipped, coincided
with the dock scrolling away with the transcript. The orchestrator hot-fixed
the live css by deleting the chrome `::before` rule and the `isolation`
declaration and putting the blur directly on the element; the gradient tint
stayed. Start from that state (themes/ is what is installed now; a copy of
the P7 version is under `/tmp/lg-themes-backup-*`).

**Design constraint for P7b:** no pseudo-elements, no `isolation`, and no
layout properties on the sticky footer, the header, or the shelf. Achieve
the fade with `background-image` gradients (tint fades) and a constant
`backdrop-filter` on the element itself; the blur does not fade. The
hairline is a `box-shadow: inset 0 1px 0 …` (dock) / `inset 0 -1px 0 …`
(header). This is less pretty than a fading blur and it is the correct
trade: layout must not change.

## Fix


- **Never override host layout properties on host elements.** The theme may
  set backgrounds, borders, shadows, blur, and masks on a pseudo-element; it
  must not set `position`, `inset`, `display`, `overflow`, `contain`,
  `isolation`, `height`, `min-height`, `flex`, or `transform` on any host
  chrome selector. If a pseudo-element needs a positioned parent and the
  host element is `static`, choose a different anchor (the nearest host
  element that is already positioned) or use `background-image` gradients
  plus `backdrop-filter` directly on the element without a mask, rather
  than repositioning the host element. Grep the current css for the
  offending declarations and remove them; verify by scrolling a long thread
  that the dock stays at the bottom and shrinks the transcript as before.
- Contract test: no host chrome selector rule contains those layout
  properties (a regex assertion over the css).

- Never put `mask-image` or the gradient on an element that contains
  content. Paint the chrome background on a dedicated layer: an absolutely
  positioned `::before` (inset 0, `z-index: -1`, `pointer-events: none`)
  on the header/dock root only if that root is already positioned by the host; otherwise see the layout rule above. The `::before` carries the gradient background, the backdrop
  blur, and the mask. Children render untouched at full opacity.
- Fade direction: the **outer** edge is fully frosted (`--lg-chrome-a`),
  the **inner** edge (toward the transcript) fades to the pane's glass over
  `--lg-chrome-fade`. For the dock the outer edge is the bottom; for the
  header it is the top; for the secondary-panel header, the top.
- The composer card (`[data-promptbox]`) keeps its own solid-ish surface
  (`chromeOpacity + 0.12`, no gradient) and its full border radius; nothing
  clips it: check `overflow` on the dock root and its `::before` and ensure
  the card's rounded corners and bottom border are visible.
- The footer row under the composer stays at full opacity.
- Add the same `::before` structure to every selector P7 styled; remove the
  masks from the containers.
- Contract test: for each chrome selector, the css applies `mask-image`
  only inside a `::before` rule, never on the container; a
  `position: relative` on the root; and the gradient direction per element
  (`to top` for the dock, `to bottom` for headers) is asserted.
- If a bb layout gives the dock or header `overflow: hidden` or a
  `contain` that clips the pseudo-element, handle it with the pseudo-element
  inset rather than changing the host's overflow.

Bump the patch version. No `bb theme set`; no reinstall (I1 does it); do not change appearance values.

## Verify

`npm test`, `npx tsc --noEmit`, `bb plugin build`. Report per brief §5 with the list of chrome selectors and their fade direction.
