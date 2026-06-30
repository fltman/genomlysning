// Minimal progressiv förbättring. Inga beroenden, inga externa anrop.
// Markerar aktiv sektion i menyn när man scrollar.
(function () {
  "use strict";

  var links = Array.prototype.slice.call(
    document.querySelectorAll('.site-nav a[href^="#"]')
  );
  if (!links.length || !("IntersectionObserver" in window)) return;

  var map = {};
  links.forEach(function (a) {
    var id = a.getAttribute("href").slice(1);
    var sec = document.getElementById(id);
    if (sec) map[id] = a;
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (a) { a.removeAttribute("aria-current"); });
          var active = map[entry.target.id];
          if (active) active.setAttribute("aria-current", "true");
        }
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );

  Object.keys(map).forEach(function (id) {
    var sec = document.getElementById(id);
    if (sec) observer.observe(sec);
  });
})();
