// Collapse specific top-level navigation sections by default.
//
// `navigation.expand` opens every section (matching the original UI5 docs) by
// stamping the toggle with the `md-toggle--indeterminate` class, which the
// theme CSS expands via `.md-toggle--indeterminate ~ .md-nav`. To re-collapse
// the two long, lower-priority sections we remove that class and clear the
// checked/indeterminate state. The user can still open them by clicking.
//
// Material's `document$` fires on initial load (and on instant navigation),
// so the state is reapplied as the user moves between pages.
const COLLAPSE_SECTIONS = ["Resources", "Development"];

document$.subscribe(function () {
  document
    .querySelectorAll(
      ".md-nav--primary > .md-nav__list > .md-nav__item--nested > label.md-nav__link"
    )
    .forEach(function (label) {
      const span = label.querySelector(".md-ellipsis");
      const text = (span ? span.textContent : label.textContent).trim();
      if (COLLAPSE_SECTIONS.indexOf(text) === -1) {
        return;
      }
      const toggle = label.previousElementSibling;
      if (toggle && toggle.classList.contains("md-nav__toggle")) {
        toggle.classList.remove("md-toggle--indeterminate");
        toggle.indeterminate = false;
        toggle.checked = false;
      }
    });
});
